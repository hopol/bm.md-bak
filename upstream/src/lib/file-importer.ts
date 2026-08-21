import { toast } from 'sonner'
import { DocumentImportError, getDocumentImportErrorMessage } from '@/lib/document/error'
import { DOCUMENT_MAX_FILE_SIZE, getDocumentFormatHint, isDocumentFile } from '@/lib/document/files'
import { getMarkdownFileExtension, isMarkdownFileName } from '@/lib/markdown-file'
import { useFilesStore } from '@/stores/files'

const HTML_FILE_EXTENSIONS = new Set(['.html', '.htm'])

type ImportFileKind = 'image' | 'markdown' | 'html' | 'document' | 'unsupported'

interface ImportedFile {
  name: string
  content: string
  kind: Exclude<ImportFileKind, 'image' | 'unsupported'>
}

function getFileExtension(name: string): string {
  return name.match(/\.[^.]+$/)?.[0].toLowerCase() ?? ''
}

export function classifyFile(file: Pick<File, 'name' | 'type'>): ImportFileKind {
  const extension = getFileExtension(file.name)
  if (file.type.startsWith('image/')) {
    return 'image'
  }

  if (isMarkdownFileName(file.name) || file.type === 'text/markdown') {
    return 'markdown'
  }

  if (HTML_FILE_EXTENSIONS.has(extension) || file.type === 'text/html') {
    return 'html'
  }

  if (isDocumentFile(file)) {
    return 'document'
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

  if (kind === 'document') {
    if (file.size > DOCUMENT_MAX_FILE_SIZE) {
      throw new DocumentImportError('tooLarge')
    }
    try {
      const [{ convertDocument }, bytes] = await Promise.all([
        import('@/lib/document/browser'),
        file.arrayBuffer(),
      ])
      const content = await convertDocument({
        bytes,
        formatHint: getDocumentFormatHint(file),
      })
      const baseName = file.name.replace(/\.[^.]+$/, '')
      return { name: `${baseName}.md`, content, kind }
    }
    catch (error) {
      throw error instanceof DocumentImportError ? error : new DocumentImportError('runtime')
    }
  }

  return null
}

export async function importFilesAsNewTabs(files: File[]): Promise<void> {
  const { createFile } = useFilesStore.getState()
  for (const file of files) {
    try {
      // react-doctor-disable-next-line react-doctor/async-await-in-loop -- 文档转换和文件创建需要串行，避免 WASM 内存峰值并保持原始顺序。
      const parsed = await parseFileToMarkdown(file)
      if (!parsed) {
        toast.error(`不支持的文件: ${file.name}`)
        continue
      }
      try {
        await createFile(parsed.name, parsed.content)
        toast.success(`导入成功: ${parsed.name}`)
      }
      catch (error) {
        console.error('Import error:', error)
        toast.error(`导入失败: ${file.name}`)
      }
    }
    catch (error) {
      console.error('Import error:', error)
      toast.error(error instanceof DocumentImportError
        ? getDocumentImportErrorMessage(file.name, error)
        : `导入失败: ${file.name}`)
    }
  }
}

export function partitionImportFiles(files: File[]): { nonImageFiles: File[], imageFiles: File[] } {
  const nonImageFiles: File[] = []
  const imageFiles: File[] = []
  for (const file of files) {
    if (classifyFile(file) === 'image') {
      imageFiles.push(file)
    }
    else {
      nonImageFiles.push(file)
    }
  }
  return { nonImageFiles, imageFiles }
}
