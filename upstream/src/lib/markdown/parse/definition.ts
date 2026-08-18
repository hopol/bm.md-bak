import type { CliDefinition } from '../types/definition'
import * as z from 'zod'
import { INPUT_SIZE_ERROR, MAX_INPUT_SIZE } from '../constants'
import { outputOption } from '../types/definition'

export const parseDefinition = {
  name: 'parse' as const,
  title: '解析 HTML 为 Markdown',
  description: '将 HTML 内容反向转换为 Markdown 格式。适用于从网页复制内容、导入已有文章、或将富文本转换为 Markdown 进行编辑。会自动清理不安全的 HTML 标签。',
  inputSchema: z.object({
    html: z.string().max(MAX_INPUT_SIZE, INPUT_SIZE_ERROR).describe('要转换的 HTML 源代码，可以是完整文档或 HTML 片段'),
  }),
  outputSchema: z.object({
    result: z.string().describe('转换后的 Markdown 文本，使用 - 作为无序列表标记'),
  }),
  cli: {
    inputField: 'html',
    inputLabel: 'file',
    options: [outputOption],
  } satisfies CliDefinition,
}
