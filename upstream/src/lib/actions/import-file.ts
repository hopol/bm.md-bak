import { toast } from 'sonner'
import { DOCUMENT_FILE_ACCEPT } from '@/lib/document/files'
import { importFilesAsNewTabs, partitionImportFiles } from '@/lib/file-importer'
import { MARKDOWN_FILE_ACCEPT } from '@/lib/markdown-file'

const ACCEPT_TYPES = `text/html,text/markdown,${MARKDOWN_FILE_ACCEPT},${DOCUMENT_FILE_ACCEPT},image/*`

function triggerImportDialog(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.accept = ACCEPT_TYPES

    let resolved = false

    function cleanup() {
      input.onchange = null
      window.removeEventListener('focus', handleWindowFocus)
    }

    function handleWindowFocus() {
      setTimeout(() => {
        if (!resolved) {
          resolved = true
          cleanup()
          resolve([])
        }
      }, 300)
    }

    input.onchange = (e) => {
      if (resolved)
        return
      resolved = true
      cleanup()
      const target = e.target as HTMLInputElement
      resolve(target.files ? Array.from(target.files) : [])
    }

    window.addEventListener('focus', handleWindowFocus, { once: true })
    input.click()
  })
}

export async function handleImportFiles() {
  const files = await triggerImportDialog()
  if (!files.length)
    return

  const { nonImageFiles, imageFiles } = partitionImportFiles(files)

  if (nonImageFiles.length > 0) {
    await importFilesAsNewTabs(nonImageFiles)
  }

  if (imageFiles.length > 0) {
    const { getImportEditorView, importFilesToEditor } = await import(
      '@/components/markdown/editor/file-import',
    )
    const view = getImportEditorView()
    if (view) {
      await importFilesToEditor(view, imageFiles, view.state.selection.main.anchor)
    }
    else {
      toast.error('编辑器尚未就绪')
    }
  }
}
