import { describe, expect, it, vi } from 'vitest'
import { handler } from './api'

async function renderRequest(mermaidTheme: string) {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  return handler.handle(new Request('http://localhost/api/markdown/render', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      markdown: '```mermaid\nflowchart TD\nA[中文入口] --> B[完成]\n```',
      mermaidTheme,
      platform: 'wechat',
    }),
  }), { prefix: '/api', context: { headers } })
}

describe('markdown REST render', () => {
  it.each(['', 'dark'])('通过真实 /api/markdown/render 渲染 Mermaid 主题 %s', async (theme) => {
    const { matched, response } = await renderRequest(theme)
    expect(matched).toBe(true)
    expect(response?.status).toBe(200)
    const data = await response!.json() as { result: string }
    expect(data.result).toContain('<svg')
    expect(data.result).toContain('中文入口')
    expect(data.result).not.toContain('figure-mermaid-error')
    expect(data.result).not.toMatch(/var\(|currentColor|color-mix\(/i)
  })

  it('旧 Mermaid 主题返回输入校验错误', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const { matched, response } = await renderRequest('github-dark')
      expect(matched).toBe(true)
      expect(response?.status).toBe(400)
      expect(await response!.text()).toContain('mermaidTheme')
    }
    finally {
      log.mockRestore()
    }
  })
})
