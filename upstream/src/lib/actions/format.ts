import { toast } from 'sonner'

export async function formatMarkdown(
  content: string,
  setContent: (content: string) => boolean | void,
) {
  try {
    const { markdown } = await import('@/lib/markdown/browser')
    const { result: formatted } = await markdown.lint({ markdown: content })
    if (setContent(formatted) === false) {
      return
    }
    toast.success('格式化成功')
  }
  catch (error) {
    toast.error('格式化失败')
    console.error(error)
  }
}
