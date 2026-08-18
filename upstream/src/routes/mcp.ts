import { createFileRoute } from '@tanstack/react-router'
import { createMarkdownMcpServer } from '@/lib/markdown/mcp'
import { handleMcpRequest } from '@/utils/mcp-handler'

export const Route = createFileRoute('/mcp')({
  server: {
    handlers: {
      GET: () => new Response(null, {
        status: 302,
        headers: { Location: '/docs/mcp' },
      }),
      POST: async ({ request }) => handleMcpRequest(request, createMarkdownMcpServer()),
    },
  },
})
