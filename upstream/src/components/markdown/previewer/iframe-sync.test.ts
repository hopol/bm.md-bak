import type { RenderedPreview } from './iframe-sync'
import { describe, expect, it } from 'vitest'
import { syncIframeContent } from './iframe-sync'

describe('iframe 内容同步', () => {
  it('iframe 文档未就绪时保留待提交输入且返回失败', () => {
    const preview: RenderedPreview = {
      html: '<section>正文</section>',
      css: 'section { color: red; }',
      colorScheme: 'light',
      signature: '当前签名',
      commitReady: true,
    }
    const pending = { current: null as RenderedPreview | null }

    expect(syncIframeContent(null, preview, pending)).toBe(false)
    expect(pending.current).toBe(preview)
  })
})
