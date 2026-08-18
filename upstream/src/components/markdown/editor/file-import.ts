import { EditorView, ViewPlugin } from '@codemirror/view'
import { toast } from 'sonner'
import {
  classifyFile,
  importFilesAsNewTabs,
  isImageFile,
  isTextFile,
  parseFileToMarkdown,
} from '@/lib/file-importer'
import { uploadImage } from '@/lib/upload-image'

let currentEditorView: EditorView | null = null

export function getImportEditorView(): EditorView | null {
  return currentEditorView
}

function getFilesFromDataTransfer(dataTransfer: DataTransfer | null): File[] {
  if (!dataTransfer) {
    return []
  }

  const filesFromItems: File[] = []
  for (const item of Array.from(dataTransfer.items ?? [])) {
    if (item.kind !== 'file') {
      continue
    }

    const file = item.getAsFile()
    if (file) {
      filesFromItems.push(file)
    }
  }

  return filesFromItems.length
    ? filesFromItems
    : Array.from(dataTransfer.files ?? [])
}

function looksLikeMarkdown(text: string): boolean {
  return /^#{1,6}\s|\*\*|__|```|^\s*[-*+]\s|\[.+\]\(.+\)/m.test(text)
}

export const importViewTrackerExtension = ViewPlugin.fromClass(
  class {
    private view: EditorView

    constructor(view: EditorView) {
      this.view = view
      currentEditorView = view
    }

    destroy() {
      if (currentEditorView === this.view) {
        currentEditorView = null
      }
    }
  },
)

export async function importFilesToEditor(
  view: EditorView,
  files: File[],
  options: { insertPos?: number, replaceAll?: boolean } = {},
): Promise<void> {
  if (!files.length) {
    return
  }

  const { insertPos, replaceAll = false } = options
  const selection = view.state.selection.main
  let currentInsertPos = insertPos ?? selection.from

  for (const file of files) {
    const fileKind = classifyFile(file)
    if (fileKind !== 'unsupported') {
      try {
        // react-doctor-disable-next-line react-doctor/async-await-in-loop -- 导入会立即修改编辑器内容，必须按用户文件顺序处理。
        const parsed = await parseFileToMarkdown(file)
        if (!parsed) {
          continue
        }
        const from = replaceAll ? 0 : (insertPos ?? selection.from)
        const to = replaceAll ? view.state.doc.length : (insertPos ?? selection.to)
        view.dispatch({
          changes: { from, to, insert: parsed.content },
          selection: { anchor: from + parsed.content.length },
        })
        const label = parsed.kind === 'html' ? 'HTML' : 'Markdown'
        toast.success(`${label} 导入成功: ${file.name}`)
        break
      }
      catch (error) {
        const label = fileKind === 'html' ? 'HTML 解析' : 'Markdown 读取'
        console.error(`${label} error:`, error)
        toast.error(`${label}失败: ${file.name}`)
      }
      continue
    }

    if (file.type.startsWith('image/')) {
      const toastId = toast.loading(`正在上传 ${file.name}…`)
      try {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('name', file.name)
        // react-doctor-disable-next-line react-doctor/async-await-in-loop -- 图片插入位置依赖上一张图片长度，需要串行更新光标。
        const result = await uploadImage(formData)

        const imageMarkdown = `\n![${file.name}](${result.url})\n`

        view.dispatch({
          changes: { from: currentInsertPos, insert: imageMarkdown },
          selection: { anchor: currentInsertPos + imageMarkdown.length },
        })
        currentInsertPos += imageMarkdown.length
        toast.success(`图片上传成功: ${file.name}`, { id: toastId })
      }
      catch (error) {
        console.error('Image upload error:', error)
        const message = error instanceof Error ? error.message : `图片上传失败: ${file.name}`
        toast.error(message, { id: toastId })
      }
      continue
    }
  }
}

export const importDropPasteExtension = EditorView.domEventHandlers({
  drop(event, view) {
    const files = getFilesFromDataTransfer(event.dataTransfer)
    if (!files.length) {
      return
    }

    event.preventDefault()

    const textFiles = files.filter(isTextFile)
    const imageFiles = files.filter(isImageFile)

    if (textFiles.length > 0) {
      void importFilesAsNewTabs(textFiles)
      return
    }

    if (imageFiles.length > 0) {
      void importFilesToEditor(view, imageFiles, { insertPos: view.state.selection.main.anchor })
    }
  },
  paste(event, view) {
    const files = getFilesFromDataTransfer(event.clipboardData)
    if (files.length) {
      event.preventDefault()
      const insertPos = view.state.selection.main.anchor
      void importFilesToEditor(view, files, { insertPos })
      return
    }

    const html = event.clipboardData?.getData('text/html') ?? ''
    const text = event.clipboardData?.getData('text/plain') ?? ''

    // 如果纯文本看起来已经是 Markdown，跳过 HTML 解析
    if (!html || looksLikeMarkdown(text)) {
      return
    }

    event.preventDefault()
    const selection = view.state.selection.main
    void (async () => {
      try {
        const { markdown } = await import('@/lib/markdown/browser')
        const { result: md } = await markdown.parse({ html })
        view.dispatch({
          changes: { from: selection.from, to: selection.to, insert: md },
          selection: { anchor: selection.from + md.length },
        })
        toast.success('HTML 解析成功')
      }
      catch (error) {
        console.error('HTML parse error:', error)
        toast.error('HTML 解析失败')
      }
    })()
  },
})
