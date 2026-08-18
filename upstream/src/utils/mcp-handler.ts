import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { logSafeError } from '@/lib/log-safe-error'

export async function handleMcpRequest(
  request: Request,
  server: McpServer,
): Promise<Response> {
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })

  try {
    await server.connect(transport)

    return await transport.handleRequest(request)
  }
  catch (error) {
    logSafeError('MCP handler error', error)

    // Return a JSON-RPC error response
    return Response.json(
      {
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
        },
        id: null,
      },
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      },
    )
  }
  finally {
    await transport.close().catch(() => {})
  }
}
