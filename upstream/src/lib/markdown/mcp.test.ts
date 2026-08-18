import { describe, expect, it } from 'vitest'

import { handleMcpRequest } from '@/utils/mcp-handler'
import { createMarkdownMcpServer } from './mcp'

interface ToolsListResponse {
  result?: {
    tools?: Array<{ name: string }>
  }
}

interface ToolsCallResponse {
  result?: {
    content?: Array<{ type: string, text?: string }>
    structuredContent?: { result?: string }
  }
  error?: JsonRpcError
}

interface JsonRpcError {
  code: number
  message: string
}

interface JsonRpcErrorResponse {
  error?: JsonRpcError
}

async function requestMcp(body: unknown) {
  return handleMcpRequest(
    new Request('http://localhost/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
      },
      body: JSON.stringify(body),
    }),
    createMarkdownMcpServer(),
  )
}

describe('markdown MCP server', () => {
  it('通过 tools/list 暴露四个 Markdown 工具', async () => {
    const response = await requestMcp({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
    const data = await response.json() as ToolsListResponse
    const toolNames = data.result?.tools?.map(tool => tool.name).sort()

    expect(toolNames).toEqual(['extract', 'lint', 'parse', 'render'])
  })

  it('通过 tools/call 调用 render 返回文本 JSON 和结构化标题 HTML', async () => {
    const response = await requestMcp({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'render',
        arguments: { markdown: '# 标题' },
      },
    })
    const data = await response.json() as ToolsCallResponse
    const text = data.result?.content?.[0]?.text ?? '{}'
    const content = JSON.parse(text) as { result?: string }

    expect(response.status).toBe(200)
    expect(data.result?.content?.[0]?.type).toBe('text')
    expect(content.result).toContain('<h1')
    expect(content.result).toContain('标题')
    expect(data.result?.structuredContent?.result).toContain('<h1')
    expect(data.result?.structuredContent?.result).toContain('标题')
  })

  it('通过 tools/call 调用 extract 返回纯文本结果', async () => {
    const response = await requestMcp({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'extract',
        arguments: { markdown: '# 标题\n\n**正文** [链接](https://example.com)' },
      },
    })
    const data = await response.json() as ToolsCallResponse

    expect(response.status).toBe(200)
    expect(data.result?.structuredContent?.result).toContain('标题')
    expect(data.result?.structuredContent?.result).toContain('正文 链接')
  })

  it('通过 tools/call 传入非法参数时返回 JSON-RPC 错误', async () => {
    const response = await requestMcp({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 42,
        arguments: { markdown: '# 标题' },
      },
    })
    const data = await response.json() as JsonRpcErrorResponse

    expect(response.status).not.toBe(500)
    expect(data.error?.code).toBeTypeOf('number')
    expect(data.error?.message).toBeTypeOf('string')
  })
})
