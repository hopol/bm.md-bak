import { createFileRoute } from '@tanstack/react-router'
import { createMarkdownMcpServer } from '@/lib/markdown/mcp'
import { createMcpHttpHandler, handleMcpOptionsRequest, handleMcpRequest } from '@/utils/mcp-handler'

const mcpHandler = createMcpHttpHandler(createMarkdownMcpServer)

export const Route = createFileRoute('/mcp')({
  server: {
    handlers: {
      GET: () => new Response(null, {
        status: 302,
        headers: { Location: '/docs/mcp' },
      }),
      OPTIONS: ({ request }) => handleMcpOptionsRequest(request),
      POST: async ({ request }) => handleMcpRequest(request, mcpHandler),
    },
  },
})
