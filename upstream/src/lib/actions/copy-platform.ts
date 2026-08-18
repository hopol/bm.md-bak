import type { SupportedPlatform } from '@/config'
import { toast } from 'sonner'
import { platformConfig } from '@/config'
import { trackEvent } from '@/lib/analytics'
import { copyHtml } from '@/lib/clipboard'

interface CopyPlatformOptions {
  platform: SupportedPlatform
  markdownStyle: string
  codeTheme: string
  mermaidTheme: string
  infographicTheme: string
  infographicPalette: string
  source: 'button' | 'menu'
  getHtml: () => Promise<string>
}

export async function copyPlatform({
  platform,
  markdownStyle,
  codeTheme,
  mermaidTheme,
  infographicTheme,
  infographicPalette,
  source,
  getHtml,
}: CopyPlatformOptions) {
  const config = platformConfig[platform]
  try {
    const html = await getHtml()
    if (!html.trim()) {
      toast.error('没有可复制的内容')
      return
    }
    const success = await copyHtml(html)
    if (success) {
      toast.success(config.successMessage)
      trackEvent('copy', platform, source, {
        markdownStyle,
        codeTheme,
        mermaidTheme,
        infographicTheme,
        infographicPalette,
      })
    }
    else {
      toast.error('复制失败')
    }
  }
  catch {
    toast.error('复制失败，请稍后重试')
  }
}
