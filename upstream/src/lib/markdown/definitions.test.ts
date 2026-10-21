import { describe, expect, it } from 'vitest'
import { DEFAULT_MARKDOWN_STYLE_ID } from '@/themes/markdown-style/metadata'

import { markdownTools, renderDefinition } from './definitions'

describe('markdown 工具 registry', () => {
  it('暴露 render/parse/extract/lint 四个工具', () => {
    const toolNames = markdownTools.map(tool => tool.name).sort()

    expect(toolNames).toEqual(['extract', 'lint', 'parse', 'render'])
  })

  it('每个工具保持统一 registry 结构', () => {
    for (const tool of markdownTools) {
      expect(tool).toEqual(expect.objectContaining({
        name: expect.any(String),
        title: expect.any(String),
        description: expect.any(String),
        inputSchema: expect.any(Object),
        outputSchema: expect.any(Object),
        cli: expect.any(Object),
        run: expect.any(Function),
      }))
    }
  })

  it('调用方通过 schema 拒绝非法输入', () => {
    for (const tool of markdownTools) {
      expect(() => tool.inputSchema.parse({})).toThrow()
    }
  })

  it('render 默认使用 Kami 主题', () => {
    const input = renderDefinition.inputSchema.parse({ markdown: '# 标题' })

    expect(input.markdownStyle).toBe(DEFAULT_MARKDOWN_STYLE_ID)
  })

  it('mermaid 主题仅接受默认浅色与 dark，拒绝旧主题', () => {
    expect(renderDefinition.inputSchema.parse({ markdown: '' }).mermaidTheme).toBe('')
    expect(renderDefinition.inputSchema.parse({ markdown: '', mermaidTheme: 'dark' }).mermaidTheme).toBe('dark')
    expect(renderDefinition.inputSchema.safeParse({ markdown: '', mermaidTheme: 'github-dark' }).success).toBe(false)
  })
})
