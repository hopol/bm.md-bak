import type {
  InitializeResult,
  JSONRPCErrorResponse,
  JSONRPCNotification,
  McpServerFactory,
} from '@modelcontextprotocol/server'
import type { McpResult } from './mcp-test-helper'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'

import { createMarkdownMcpServer } from '@/lib/markdown/mcp'
import {
  createMcpHttpHandler,
  handleMcpOptionsRequest,
} from './mcp-handler'
import {
  createMcpRequest,
  modernMcpMeta,
  readMcpJson,
  readMcpSseJson,
} from './mcp-test-helper'

const handler = createMcpHttpHandler(createMarkdownMcpServer)

afterEach(() => {
  vi.restoreAllMocks()
})

afterAll(() => handler.close())

describe('mcp HTTP handler', () => {
  it.each([
    ['缺失', null],
    ['错误', 'application/json'],
  ])('accept header %s时返回带 CORS 的 406 协议错误', async (_label, accept) => {
    const response = await createMcpRequest(
      handler,
      { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      { accept, origin: 'https://example.com' },
    )
    const data = await readMcpJson<JSONRPCErrorResponse>(response)

    expect(response.status).toBe(406)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(data.jsonrpc).toBe('2.0')
    expect(data.error.code).toBeTypeOf('number')
    expect(data.error.message).toBeTypeOf('string')
  })

  it('malformed JSON 返回带 CORS 的解析错误且不暴露原始 data', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const response = await createMcpRequest(
      handler,
      {},
      {
        origin: 'https://example.com',
        rawBody: '{broken',
      },
    )
    const data = await readMcpJson<JSONRPCErrorResponse>(response)

    expect(response.status).toBe(400)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(data).toEqual({
      jsonrpc: '2.0',
      error: {
        code: -32700,
        message: 'Parse error: Invalid JSON',
      },
      id: null,
    })
    expect(data.error).not.toHaveProperty('data')
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('server factory 异常由 SDK 返回带 CORS 的安全 500', async () => {
    const serverFactory = vi.fn().mockRejectedValue(new Error('secret detail')) as McpServerFactory
    const errorHandler = createMcpHttpHandler(serverFactory)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      const response = await createMcpRequest(
        errorHandler,
        { jsonrpc: '2.0', id: 1, method: 'tools/list' },
        { origin: 'https://example.com' },
      )
      const data = await readMcpJson<JSONRPCErrorResponse>(response)

      expect(response.status).toBe(500)
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
      expect(data.error).toEqual({ code: -32603, message: 'Internal server error' })
      expect(JSON.stringify(data)).not.toContain('secret detail')
      expect(consoleError).toHaveBeenCalledWith('MCP handler error', {
        type: 'Error',
        code: undefined,
        status: undefined,
      })
    }
    finally {
      await errorHandler.close()
    }
  })

  it('2025-06-18 initialize 成功且不创建 session', async () => {
    const response = await createMcpRequest(handler, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'bm.md-test', version: '1.0.0' },
      },
    })
    const data = await readMcpJson<McpResult<InitializeResult>>(response)

    expect(response.status).toBe(200)
    expect(data.result.serverInfo.name).toBe('bmmd')
    expect(response.headers.get('Mcp-Session-Id')).toBeNull()
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })

  it('notification 请求无需等待响应消息', async () => {
    const response = await createMcpRequest(handler, {
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    })

    expect(response.status).toBe(202)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    await expect(response.text()).resolves.toBe('')
  })

  it('复用 HTTP handler 时每请求创建 server 且不会请求级 close', async () => {
    const serverFactory = vi.fn(createMarkdownMcpServer)
    const reusedHandler = createMcpHttpHandler(serverFactory)
    const closeSpy = vi.spyOn(reusedHandler, 'close')

    await createMcpRequest(reusedHandler, { jsonrpc: '2.0', id: 1, method: 'tools/list' })
    await createMcpRequest(reusedHandler, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: { _meta: modernMcpMeta },
    }, { modern: true })

    expect(serverFactory).toHaveBeenCalledTimes(2)
    expect(closeSpy).not.toHaveBeenCalled()
    closeSpy.mockRestore()
    await reusedHandler.close()
  })

  it('复用 handler 的 modern subscription 在 fetch 返回后仍能收到 notify', async () => {
    const subscriptionHandler = createMcpHttpHandler(createMarkdownMcpServer)
    const response = await createMcpRequest(subscriptionHandler, {
      jsonrpc: '2.0',
      id: 1,
      method: 'subscriptions/listen',
      params: {
        _meta: modernMcpMeta,
        notifications: { toolsListChanged: true },
      },
    }, { modern: true })
    const reader = response.body?.getReader()

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toContain('text/event-stream')
    expect(reader).toBeDefined()

    subscriptionHandler.notify.toolsChanged()
    const first = await readMcpSseJson<JSONRPCNotification>(reader!)
    const notification = first.method === 'notifications/tools/list_changed'
      ? first
      : await readMcpSseJson<JSONRPCNotification>(reader!)

    expect(notification.method).toBe('notifications/tools/list_changed')

    await reader!.cancel()
    await subscriptionHandler.close()
  })

  it.each([
    'https://example.com',
    'http://localhost:2663',
    'https://app.example.org:8443',
  ])('允许合法网站 Origin：%s', async (origin) => {
    const response = await createMcpRequest(
      handler,
      { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      { origin },
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(response.headers.has('Access-Control-Allow-Credentials')).toBe(false)
  })

  it.each([
    ['null', 'null'],
    ['畸形值', 'not an origin'],
    ['非 HTTP(S)', 'file://example.com'],
    ['带路径', 'https://example.com/path'],
    ['带 query', 'https://example.com?query=1'],
    ['多个 Origin', 'https://one.example, https://two.example'],
  ])('拒绝%s Origin', async (_label, origin) => {
    const response = await createMcpRequest(
      handler,
      { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      { origin },
    )

    expect(response.status).toBe(403)
    expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false)
  })

  it('合法 OPTIONS 预检返回 204 和开放式 CORS headers', () => {
    const response = handleMcpOptionsRequest(new Request('http://localhost/mcp', {
      method: 'OPTIONS',
      headers: { Origin: 'https://any.example' },
    }))

    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(response.headers.get('Access-Control-Allow-Methods')).toBe('POST, OPTIONS')
    expect(response.headers.get('Access-Control-Allow-Headers')).toBe(
      'Content-Type, Accept, MCP-Protocol-Version, Mcp-Method, Mcp-Name',
    )
    expect(response.headers.has('Access-Control-Allow-Credentials')).toBe(false)
  })

  it('非法 Origin 的 OPTIONS 预检返回 403 且不带 CORS', () => {
    const response = handleMcpOptionsRequest(new Request('http://localhost/mcp', {
      method: 'OPTIONS',
      headers: { Origin: 'https://example.com/path' },
    }))

    expect(response.status).toBe(403)
    expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false)
  })
})
