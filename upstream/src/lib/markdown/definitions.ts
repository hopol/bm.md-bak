import type * as z from 'zod'
import { extractDefinition } from './extract/definition'
import { lintDefinition } from './lint/definition'
import { parseDefinition } from './parse/definition'
import { renderDefinition } from './render/definition'

export { extractDefinition } from './extract/definition'
export { lintDefinition } from './lint/definition'
export { parseDefinition } from './parse/definition'
export { renderDefinition } from './render/definition'
export type { CliDefinition, CliOptionDefinition } from './types/definition'

function defineMarkdownTool<const TDefinition extends { inputSchema: z.ZodType }>(
  definition: TDefinition,
  run: (input: z.output<TDefinition['inputSchema']>) => Promise<string>,
) {
  return {
    ...definition,
    run,
  }
}

export const markdownTools = [
  defineMarkdownTool(renderDefinition, async (input) => {
    const { render } = await import('./render/html')
    return render(input)
  }),
  defineMarkdownTool(parseDefinition, async (input) => {
    const { parse } = await import('./parse/html')
    return parse(input.html)
  }),
  defineMarkdownTool(extractDefinition, async (input) => {
    const { extract } = await import('./extract/text')
    return extract(input.markdown)
  }),
  defineMarkdownTool(lintDefinition, async (input) => {
    const { lint } = await import('./lint/markdown')
    return lint(input.markdown)
  }),
] as const

export type MarkdownTool = typeof markdownTools[number]
export type MarkdownToolName = MarkdownTool['name']

export function runMarkdownTool<TTool extends MarkdownTool>(
  tool: TTool,
  input: z.output<TTool['inputSchema']>,
): Promise<string> {
  const run = tool.run as (input: unknown) => Promise<string>
  return run(input)
}
