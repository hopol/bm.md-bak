import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createMarkdownMcpServer } from '@/lib/markdown/mcp'
import { handleMcpRequest } from './mcp-handler'

interface JsonRpcErrorResponse {
  jsonrpc: '2.0'
  error: {
    code: number
    message: string
    data?: unknown
  }
  id: null
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('handleMcpRequest', () => {
  it.each([
    ['缺失', undefined],
    ['错误', 'application/json'],
  ])('accept header %s时返回 406 JSON-RPC 错误', async (_label, accept) => {
    const headers = new Headers({ 'Content-Type': 'application/json' })
    if (accept) {
      headers.set('Accept', accept)
    }

    const response = await handleMcpRequest(
      new Request('http://localhost/mcp', {
        method: 'POST',
        headers,
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      }),
      createMarkdownMcpServer(),
    )
    const data = await response.json() as JsonRpcErrorResponse

    expect(response.status).toBe(406)
    expect(response.headers.get('Content-Type')).toContain('application/json')
    expect(data.jsonrpc).toBe('2.0')
    expect(data.id).toBeNull()
    expect(data.error).toEqual(expect.objectContaining({
      code: expect.any(Number),
      message: expect.any(String),
    }))
  })

  it('malformed JSON 返回协议解析错误且不暴露原始错误 data', async () => {
    const server = { connect: vi.fn() } as unknown as McpServer
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const request = new Request('http://localhost/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
      },
      body: '{broken',
    })

    const response = await handleMcpRequest(request, server)
    const data = await response.json() as JsonRpcErrorResponse

    expect(response.status).toBe(400)
    expect(response.headers.get('Content-Type')).toContain('application/json')
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

  it('未知异常返回通用内部错误且不暴露原始错误 data', async () => {
    const server = { connect: vi.fn().mockRejectedValue(new Error('secret detail')) } as unknown as McpServer
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const request = new Request('http://localhost/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    })

    const response = await handleMcpRequest(request, server)
    const data = await response.json() as JsonRpcErrorResponse

    expect(response.status).toBe(500)
    expect(data).toEqual({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: 'Internal server error',
      },
      id: null,
    })
    expect(data.error).not.toHaveProperty('data')
    expect(JSON.stringify(data)).not.toContain('secret detail')
    expect(consoleError).toHaveBeenCalledWith('MCP handler error', {
      type: 'Error',
      code: undefined,
      status: undefined,
    })
  })

  it('initialize 请求返回 JSON 响应', async () => {
    const response = await handleMcpRequest(
      new Request('http://localhost/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-06-18',
            capabilities: {},
            clientInfo: { name: 'bm.md-test', version: '1.0.0' },
          },
        }),
      }),
      createMarkdownMcpServer(),
    )
    const data = await response.json() as { result?: { serverInfo?: { name?: string } } }

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toContain('application/json')
    expect(data.result?.serverInfo?.name).toBe('bmmd')
  })

  it('notification 请求不会等待响应消息', async () => {
    const response = await handleMcpRequest(
      new Request('http://localhost/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
        },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
      }),
      createMarkdownMcpServer(),
    )

    expect(response.status).toBe(202)
    await expect(response.text()).resolves.toBe('')
  })
})
