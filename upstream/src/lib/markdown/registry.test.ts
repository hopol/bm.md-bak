import type { RouterClient } from '@orpc/server'
import type * as z from 'zod'
import type { parseDefinition, renderDefinition } from './definitions'
import { describe, expect, expectTypeOf, it } from 'vitest'

import { cliTools } from '@/cli/core'
import { handleMcpRequest } from '@/utils/mcp-handler'
import { markdownTools } from './definitions'
import { createMarkdownMcpServer } from './mcp'
import { router, workerRouter } from './router'

type ApiMarkdownClient = RouterClient<typeof router>['markdown']

interface ToolsListResponse {
  result?: {
    tools?: Array<{ name: string }>
  }
}

function sorted(values: readonly string[]) {
  return [...values].sort()
}

describe('markdown 工具集合契约', () => {
  it('registry 为四个工具同时绑定定义和执行函数', () => {
    expect(markdownTools).toHaveLength(4)

    for (const tool of markdownTools) {
      expect(tool.run).toBeTypeOf('function')
    }
  })

  it('cli、API router 与 registry 暴露完全相同的工具名', () => {
    const expectedNames = sorted(markdownTools.map(tool => tool.name))

    expect(cliTools).toBe(markdownTools)
    expect(sorted(cliTools.map(tool => tool.name))).toEqual(expectedNames)
    expect(sorted(Object.keys(router.markdown))).toEqual(expectedNames)
  })

  it('api router 保留每个工具的精确输入类型', () => {
    expectTypeOf<Parameters<ApiMarkdownClient['render']>[0]>()
      .toEqualTypeOf<z.input<typeof renderDefinition.inputSchema>>()
    expectTypeOf<Parameters<ApiMarkdownClient['parse']>[0]>()
      .toEqualTypeOf<z.input<typeof parseDefinition.inputSchema>>()
  })

  it('mcp 与 registry 暴露完全相同的工具名', async () => {
    const response = await handleMcpRequest(
      new Request('http://localhost/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      }),
      createMarkdownMcpServer(),
    )
    const data = await response.json() as ToolsListResponse
    const expectedNames = sorted(markdownTools.map(tool => tool.name))

    expect(sorted(data.result?.tools?.map(tool => tool.name) ?? [])).toEqual(expectedNames)
  })

  it('worker 只比公开工具集合额外暴露 preview', () => {
    const expectedNames = sorted([
      ...markdownTools.map(tool => tool.name),
      'preview',
    ])

    expect(sorted(Object.keys(workerRouter.markdown))).toEqual(expectedNames)
  })
})
