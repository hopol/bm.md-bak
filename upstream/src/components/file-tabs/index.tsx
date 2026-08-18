import { useEffect, useRef } from 'react'
import { useFilesStore } from '@/stores/files'
import { FILE_TAB_PANEL_ID, getFileTabId } from './a11y'
import { FileTab } from './file-tab'
import { NewFileButton } from './new-file-button'

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function FileTabs() {
  const files = useFilesStore(state => state.files)
  const activeFileId = useFilesStore(state => state.activeFileId)
  const isInitialized = useFilesStore(state => state.isInitialized)
  const initialize = useFilesStore(state => state.initialize)
  const switchFile = useFilesStore(state => state.switchFile)
  const createFile = useFilesStore(state => state.createFile)
  const deleteFile = useFilesStore(state => state.deleteFile)
  const renameFile = useFilesStore(state => state.renameFile)

  const tabsRef = useRef<Map<string, HTMLButtonElement> | null>(null)

  useEffect(() => {
    void initialize().catch(() => undefined)
  }, [initialize])

  useEffect(() => {
    if (isInitialized && activeFileId) {
      // 延迟一帧确保 DOM 已渲染且 ref 已注册
      requestAnimationFrame(() => {
        const tabElement = tabsRef.current?.get(activeFileId)
        if (tabElement) {
          tabElement.scrollIntoView({
            behavior: prefersReducedMotion() ? 'auto' : 'smooth',
            block: 'nearest',
            inline: 'nearest',
          })
        }
      })
    }
  }, [isInitialized, activeFileId])

  const handleCreateFile = async () => {
    await createFile().catch(() => undefined)
  }

  const handleDeleteFile = async (fileId: string) => {
    try {
      await deleteFile(fileId)
    }
    catch {
      return
    }

    const nextActiveFileId = useFilesStore.getState().activeFileId
    if (!nextActiveFileId) {
      return
    }

    requestAnimationFrame(() => {
      tabsRef.current?.get(nextActiveFileId)?.focus()
    })
  }

  const setTabRef = (id: string) => (el: HTMLButtonElement | null) => {
    if (!tabsRef.current) {
      tabsRef.current = new Map()
    }

    if (el) {
      tabsRef.current.set(id, el)
    }
    else {
      tabsRef.current.delete(id)
    }
  }

  const handleActivate = async (fileId: string) => {
    await switchFile(fileId).catch(() => undefined)
  }

  const handleTabKeyboardActivate = async (index: number, moveFocus: boolean) => {
    const file = files[index]
    try {
      await switchFile(file.id)
    }
    catch {
      return
    }

    if (moveFocus) {
      requestAnimationFrame(() => {
        tabsRef.current?.get(file.id)?.focus()
      })
    }
  }

  if (!isInitialized) {
    return (
      <div className="flex h-8 shrink-0 items-center border-b bg-muted/30 px-1" />
    )
  }

  return (
    <div className="flex h-8 shrink-0 items-center border-b bg-muted/30">
      <div
        role="tablist"
        aria-label="打开的文件"
        className="flex min-w-0 flex-1 scrollbar-none overflow-x-auto"
      >
        {files.map((file, index) => (
          <FileTab
            key={file.id}
            file={file}
            currentIndex={index}
            fileCount={files.length}
            isActive={file.id === activeFileId}
            tabIndex={file.id === activeFileId ? 0 : -1}
            tabId={getFileTabId(file.id)}
            panelId={FILE_TAB_PANEL_ID}
            tabRef={setTabRef(file.id)}
            onActivate={() => handleActivate(file.id)}
            onClose={() => handleDeleteFile(file.id)}
            onKeyboardActivate={handleTabKeyboardActivate}
            onRename={name => renameFile(file.id, name)}
          />
        ))}
      </div>
      <div className="shrink-0 border-l px-1">
        <NewFileButton onClick={handleCreateFile} />
      </div>
    </div>
  )
}
