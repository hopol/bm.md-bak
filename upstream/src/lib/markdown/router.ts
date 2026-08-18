import type { InferSchemaInput, InferSchemaOutput } from '@orpc/server'
import type { MarkdownTool } from './definitions'
import { os } from '@orpc/server'
import * as z from 'zod'
import { markdownTools, renderDefinition, runMarkdownTool } from './definitions'

function createMarkdownProcedure<
  TInputSchema extends MarkdownTool['inputSchema'],
  TOutputSchema extends MarkdownTool['outputSchema'],
>(
  name: string,
  inputSchema: TInputSchema,
  outputSchema: TOutputSchema,
  run: (input: InferSchemaOutput<TInputSchema>) => Promise<string>,
) {
  return os
    .route({
      method: 'POST',
      path: `/markdown/${name}`,
    })
    .input(inputSchema)
    .output(outputSchema)
    .handler(async ({ input }) => ({
      result: await run(input),
    }) as InferSchemaInput<TOutputSchema>)
}

type MarkdownProcedure<TTool extends MarkdownTool> = ReturnType<typeof createMarkdownProcedure<
  TTool['inputSchema'],
  TTool['outputSchema']
>>

type MarkdownProcedures = {
  [TTool in MarkdownTool as TTool['name']]: MarkdownProcedure<TTool>
}

const markdownProcedures = Object.fromEntries(
  markdownTools.map(tool => [
    tool.name,
    createMarkdownProcedure(
      tool.name,
      tool.inputSchema,
      tool.outputSchema,
      input => runMarkdownTool(tool, input),
    ),
  ]),
) as unknown as MarkdownProcedures

const preview = os
  .input(renderDefinition.inputSchema)
  .output(z.object({
    html: z.string(),
    css: z.string(),
  }))
  .handler(async ({ input }) => {
    const { renderPreview } = await import('./render/html')
    return renderPreview(input)
  })

export const router = {
  markdown: markdownProcedures,
}

export const workerRouter = {
  markdown: {
    ...markdownProcedures,
    preview,
  },
}
