import { toast } from 'sonner'
import { getMarkdownFileExtension, isMarkdownFileName } from '@/lib/markdown-file'
import { useFilesStore } from '@/stores/files'

export { MARKDOWN_FILE_EXTENSIONS } from '@/lib/markdown-file'

const HTML_FILE_EXTENSIONS = new Set(['.html', '.htm'])

export type ImportFileKind = 'markdown' | 'html' | 'unsupported'

export interface ImportedFile {
  name: string
  content: string
  kind: Exclude<ImportFileKind, 'unsupported'>
}

function getFileExtension(name: string): string {
  return name.match(/\.[^.]+$/)?.[0].toLowerCase() ?? ''
}

export function classifyFile(file: Pick<File, 'name' | 'type'>): ImportFileKind {
  const extension = getFileExtension(file.name)
  if (isMarkdownFileName(file.name) || file.type === 'text/markdown') {
    return 'markdown'
  }

  if (HTML_FILE_EXTENSIONS.has(extension) || file.type === 'text/html') {
    return 'html'
  }

  return 'unsupported'
}

export async function parseFileToMarkdown(file: File): Promise<ImportedFile | null> {
  const kind = classifyFile(file)
  if (kind === 'markdown') {
    const content = await file.text()
    const name = getMarkdownFileExtension(file.name)
      ? file.name
      : `${file.name}.md`
    return { name, content, kind }
  }

  if (kind === 'html') {
    const [html, { markdown }] = await Promise.all([
      file.text(),
      import('@/lib/markdown/browser'),
    ])
    const { result: content } = await markdown.parse({ html })
    const baseName = file.name.replace(/\.html?$/i, '')
    return { name: `${baseName}.md`, content, kind }
  }

  return null
}

export async function importFilesAsNewTabs(files: File[]): Promise<void> {
  const { createFile } = useFilesStore.getState()
  const parsedFiles = await Promise.allSettled(files.map(file => parseFileToMarkdown(file)))

  for (let index = 0; index < parsedFiles.length; index++) {
    const result = parsedFiles[index]
    if (result.status === 'rejected') {
      console.error('Import error:', result.reason)
      toast.error(`导入失败: ${files[index].name}`)
      continue
    }

    const parsed = result.value
    if (parsed) {
      try {
        // react-doctor-disable-next-line react-doctor/async-await-in-loop -- 文件创建会写入标签页状态，需要按原始文件顺序串行执行。
        await createFile(parsed.name, parsed.content)
        toast.success(`导入成功: ${parsed.name}`)
      }
      catch (error) {
        console.error('Import error:', error)
        toast.error(`导入失败: ${files[index].name}`)
      }
    }
  }
}

export function isTextFile(file: File): boolean {
  return classifyFile(file) !== 'unsupported'
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/')
}
