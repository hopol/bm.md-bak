import type { ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js'
import type * as z from 'zod'
import type { MarkdownTool } from './definitions'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { name, version } from '@/package.json'
import { markdownTools, runMarkdownTool } from './definitions'

function formatToolResult(result: string) {
  const output = { result }
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(output) }],
    structuredContent: output,
  }
}

function registerMarkdownTool<TTool extends MarkdownTool>(
  server: McpServer,
  tool: TTool,
) {
  const config = {
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    outputSchema: tool.outputSchema,
  }

  server.registerTool<TTool['outputSchema'], TTool['inputSchema']>(
    tool.name,
    config,
    (async (input: z.output<TTool['inputSchema']>) =>
      formatToolResult(await runMarkdownTool(tool, input))) as unknown as ToolCallback<TTool['inputSchema']>,
  )
}

export function createMarkdownMcpServer() {
  const server = new McpServer({ name, version })

  for (const tool of markdownTools) {
    registerMarkdownTool(server, tool)
  }

  return server
}
