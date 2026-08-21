import type { McpHttpHandler, McpServerFactory } from '@modelcontextprotocol/server'
import { createMcpHandler } from '@modelcontextprotocol/server'
import { logSafeError } from '@/lib/log-safe-error'

const CORS_HEADERS = {
  'Access-Control-Allow-Headers': 'Content-Type, Accept, MCP-Protocol-Version, Mcp-Method, Mcp-Name',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Origin': '*',
}

function isValidOrigin(origin: string | null): boolean {
  if (origin === null) {
    return true
  }

  try {
    const url = new URL(origin)
    return (url.protocol === 'http:' || url.protocol === 'https:')
      && origin === url.origin
  }
  catch {
    return false
  }
}

function forbiddenOriginResponse(): Response {
  return Response.json(
    {
      jsonrpc: '2.0',
      error: {
        code: -32600,
        message: 'Invalid Origin header',
      },
      id: null,
    },
    { status: 403 },
  )
}

function withCors(response: Response): Response {
  const headers = new Headers(response.headers)
  headers.set('Access-Control-Allow-Origin', '*')
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export function createMcpHttpHandler(serverFactory: McpServerFactory): McpHttpHandler {
  return createMcpHandler(serverFactory, {
    legacy: 'stateless',
    onerror: error => logSafeError('MCP handler error', error),
  })
}

export function handleMcpOptionsRequest(request: Request): Response {
  if (!isValidOrigin(request.headers.get('Origin'))) {
    return forbiddenOriginResponse()
  }

  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  })
}

export async function handleMcpRequest(
  request: Request,
  handler: McpHttpHandler,
): Promise<Response> {
  if (!isValidOrigin(request.headers.get('Origin'))) {
    return forbiddenOriginResponse()
  }

  return withCors(await handler.fetch(request))
}
