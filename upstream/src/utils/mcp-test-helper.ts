import type { JSONRPCResultResponse, McpHttpHandler } from '@modelcontextprotocol/server'
import { handleMcpRequest } from './mcp-handler'

export type McpResult<T> = Omit<JSONRPCResultResponse, 'result'> & { result: T }

export const modernMcpMeta = {
  'io.modelcontextprotocol/protocolVersion': '2026-07-28',
  'io.modelcontextprotocol/clientInfo': { name: 'bm.md-test', version: '1.0.0' },
  'io.modelcontextprotocol/clientCapabilities': {},
}

interface McpRequestOptions {
  accept?: string | null
  modern?: boolean
  origin?: string
  rawBody?: string
  headers?: HeadersInit
}

export function createMcpRequest(
  handler: McpHttpHandler,
  body: unknown,
  options: McpRequestOptions = {},
): Promise<Response> {
  const method = (body as { method?: unknown }).method
  const headers = new Headers({
    'Content-Type': 'application/json',
    ...options.headers,
  })

  if (options.accept !== null) {
    headers.set('Accept', options.accept ?? 'application/json, text/event-stream')
  }

  if (options.modern) {
    headers.set('MCP-Protocol-Version', '2026-07-28')
    if (typeof method === 'string') {
      headers.set('Mcp-Method', method)
    }
  }
  if (options.origin !== undefined) {
    headers.set('Origin', options.origin)
  }

  return handleMcpRequest(
    new Request('http://localhost/mcp', {
      method: 'POST',
      headers,
      body: options.rawBody ?? JSON.stringify(body),
    }),
    handler,
  )
}

export async function readMcpJson<T>(response: Response): Promise<T> {
  const contentType = response.headers.get('Content-Type') ?? ''
  if (contentType.includes('application/json')) {
    return response.json() as Promise<T>
  }

  if (!contentType.includes('text/event-stream')) {
    throw new Error(`不支持的 MCP 响应类型：${contentType}`)
  }

  const events = (await response.text()).split(/\r?\n\r?\n/)
  for (const event of events) {
    const data = event
      .split(/\r?\n/)
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).trimStart())
      .join('\n')
    if (data) {
      return JSON.parse(data) as T
    }
  }

  throw new Error('MCP SSE 响应中没有 JSON data 事件')
}

export async function readMcpSseJson<T>(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<T> {
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      throw new Error('MCP SSE 响应在 JSON data 事件前结束')
    }
    buffer += decoder.decode(value, { stream: true })
    const eventEnd = buffer.search(/\r?\n\r?\n/)
    if (eventEnd === -1) {
      continue
    }

    const event = buffer.slice(0, eventEnd)
    const data = event
      .split(/\r?\n/)
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).trimStart())
      .join('\n')
    if (data) {
      return JSON.parse(data) as T
    }
    buffer = buffer.slice(eventEnd).replace(/^\r?\n\r?\n/, '')
  }
}
