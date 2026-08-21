import type {
  CallToolResult,
  DiscoverResult,
  JSONRPCErrorResponse,
  ListToolsResult,
} from '@modelcontextprotocol/server'
import type { McpResult } from '@/utils/mcp-test-helper'
import { afterAll, describe, expect, it } from 'vitest'

import { createMcpHttpHandler } from '@/utils/mcp-handler'
import {
  createMcpRequest,
  modernMcpMeta,
  readMcpJson,
} from '@/utils/mcp-test-helper'
import { createMarkdownMcpServer } from './mcp'

const handler = createMcpHttpHandler(createMarkdownMcpServer)

afterAll(() => handler.close())

describe('markdown MCP server', () => {
  it('2025 legacy 与 2026 modern 暴露相同的四个 Markdown 工具且均无 session', async () => {
    const legacyResponse = await createMcpRequest(handler, { jsonrpc: '2.0', id: 1, method: 'tools/list' })
    const modernResponse = await createMcpRequest(handler, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: { _meta: modernMcpMeta },
    }, { modern: true })
    const legacy = await readMcpJson<McpResult<ListToolsResult>>(legacyResponse)
    const modern = await readMcpJson<McpResult<ListToolsResult>>(modernResponse)
    const legacyNames = legacy.result.tools.map(tool => tool.name).sort()
    const modernNames = modern.result.tools.map(tool => tool.name).sort()

    expect(legacyResponse.status).toBe(200)
    expect(modernResponse.status).toBe(200)
    expect(legacyNames).toEqual(['extract', 'lint', 'parse', 'render'])
    expect(modernNames).toEqual(legacyNames)
    expect(legacyResponse.headers.get('Mcp-Session-Id')).toBeNull()
    expect(modernResponse.headers.get('Mcp-Session-Id')).toBeNull()
  })

  it('2026-07-28 server/discover 成功', async () => {
    const response = await createMcpRequest(handler, {
      jsonrpc: '2.0',
      id: 1,
      method: 'server/discover',
      params: { _meta: modernMcpMeta },
    }, { modern: true })
    const data = await readMcpJson<McpResult<DiscoverResult>>(response)

    expect(response.status).toBe(200)
    expect(data.result.supportedVersions).toContain('2026-07-28')
    expect(response.headers.get('Mcp-Session-Id')).toBeNull()
  })

  it('通过 tools/call 调用 render 返回文本 JSON 和结构化标题 HTML', async () => {
    const response = await createMcpRequest(handler, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'render',
        arguments: { markdown: '# 标题' },
      },
    })
    const data = await readMcpJson<McpResult<CallToolResult>>(response)
    const firstContent = data.result.content[0]
    const text = firstContent?.type === 'text' ? firstContent.text : '{}'
    const content = JSON.parse(text) as { result?: string }
    const structuredResult = (data.result.structuredContent as { result?: unknown } | undefined)?.result

    expect(response.status).toBe(200)
    expect(firstContent?.type).toBe('text')
    expect(content.result).toContain('<h1')
    expect(content.result).toContain('标题')
    expect(structuredResult).toBeTypeOf('string')
    expect(structuredResult).toContain('<h1')
    expect(structuredResult).toContain('标题')
  })

  it('通过 tools/call 调用 extract 返回纯文本结果', async () => {
    const response = await createMcpRequest(handler, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'extract',
        arguments: { markdown: '# 标题\n\n**正文** [链接](https://example.com)' },
      },
    })
    const data = await readMcpJson<McpResult<CallToolResult>>(response)
    const structuredResult = (data.result.structuredContent as { result?: unknown } | undefined)?.result

    expect(response.status).toBe(200)
    expect(structuredResult).toBeTypeOf('string')
    expect(structuredResult).toContain('标题')
    expect(structuredResult).toContain('正文 链接')
  })

  it('通过 tools/call 传入非法参数时返回 JSON-RPC 错误', async () => {
    const response = await createMcpRequest(handler, {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 42,
        arguments: { markdown: '# 标题' },
      },
    })
    const data = await readMcpJson<JSONRPCErrorResponse>(response)

    expect(response.status).not.toBe(500)
    expect(data.error.code).toBeTypeOf('number')
    expect(data.error.message).toBeTypeOf('string')
  })
})
