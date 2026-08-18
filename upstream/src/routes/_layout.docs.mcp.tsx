import type { PageMeta } from '@/lib/seo'
import { createFileRoute } from '@tanstack/react-router'
import { ExternalLink } from 'lucide-react'
import { getClients, transformConfig } from 'mcp-config/src/index.js'

import { CopyButton } from '@/components/copy-button'
import PageDialog from '@/components/dialog/page'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { env } from '@/env'
import { createPageHead } from '@/lib/seo'

export const Route = createFileRoute('/_layout/docs/mcp')({
  loader: () => {
    const meta: PageMeta = {
      title: 'MCP 配置',
      description: '让 AI 助手通过 MCP 协议使用 bm.md 的排版能力',
    }
    return { meta }
  },
  head: ({ loaderData, match }) => loaderData
    ? createPageHead({ pathname: match.pathname, meta: loaderData.meta })
    : {},
  component: McpConfigPage,
})

function McpConfigContent() {
  const baseUrl = env.VITE_APP_URL || (typeof window !== 'undefined' ? window.location.origin : '')
  const mcpUrl = `${baseUrl}/mcp`

  const clients = getClients()

  const serverConfig = {
    name: 'bm-md',
    type: 'http' as const,
    url: mcpUrl,
  }

  const getClientConfig = (clientSlug: string) => {
    try {
      const result = transformConfig({
        server: serverConfig,
        client: clientSlug,
      })
      return result.config
    }
    catch {
      return null
    }
  }

  return (
    <div className="space-y-4">
      {/* MCP Server 地址 */}
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">MCP Server 地址</p>
        <div className="flex items-center gap-2 rounded-none bg-muted px-3 py-2">
          <code className="flex-1 truncate text-sm">{mcpUrl}</code>
          <CopyButton text={mcpUrl} className="shrink-0" ariaLabel="复制 MCP Server 地址" />
        </div>
      </div>

      {/* 客户端配置列表 */}
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">客户端配置</p>
        <Accordion>
          {clients.map((client) => {
            const config = getClientConfig(client.slug)
            if (!config)
              return null

            return (
              <AccordionItem key={client.slug} value={client.slug}>
                <AccordionTrigger>
                  <span className="flex items-center gap-2">
                    {client.name}
                    <span className="text-xs text-muted-foreground">
                      (
                      {client.format.toUpperCase()}
                      )
                    </span>
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-2">
                    <div className="relative rounded-none bg-muted">
                      <pre className="overflow-x-auto p-3 pr-12 text-xs">
                        <code>{config}</code>
                      </pre>
                      <div className="absolute top-2 right-2">
                        <CopyButton text={config} ariaLabel={`复制 ${client.name} 配置`} />
                      </div>
                    </div>
                    {client.docsUrl && (
                      <a
                        href={client.docsUrl}
                        title={`查看 ${client.name} 配置文档`}
                        aria-label={`查看 ${client.name} 配置文档`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`
                          inline-flex items-center gap-1 text-xs
                          text-muted-foreground underline underline-offset-2
                          hover:text-foreground
                        `}
                      >
                        查看文档
                        <ExternalLink className="size-3" aria-hidden="true" />
                      </a>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            )
          })}
        </Accordion>
      </div>
    </div>
  )
}

function McpConfigPage() {
  const { meta } = Route.useLoaderData()
  return (
    <PageDialog
      title={meta.title}
      description={meta.description}
      render={<McpConfigContent />}
    />
  )
}
