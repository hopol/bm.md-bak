import type { CliDefinition } from '../types/definition'
import * as z from 'zod'
import { INPUT_SIZE_ERROR, MAX_INPUT_SIZE } from '../constants'
import { outputOption } from '../types/definition'

export const lintDefinition = {
  name: 'lint' as const,
  title: '校验并修复 Markdown',
  description: '使用 markdownlint 规则对 Markdown 内容进行规范校验，并自动修复可修复的问题。包括：统一标题层级、修复列表缩进、规范空行、移除行尾空格等。',
  inputSchema: z.object({
    markdown: z.string().max(MAX_INPUT_SIZE, INPUT_SIZE_ERROR).describe('要校验和修复的 Markdown 源文本'),
  }),
  outputSchema: z.object({
    result: z.string().describe('校验并自动修复后的 Markdown 文本'),
  }),
  cli: {
    inputField: 'markdown',
    inputLabel: 'file',
    options: [
      outputOption,
      { name: 'fix', description: '将修复结果写回输入文件；不能与 --output 同时使用', type: 'boolean', input: false },
    ],
  } satisfies CliDefinition,
}
