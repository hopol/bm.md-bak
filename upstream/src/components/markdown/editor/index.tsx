import { ClientOnly } from '@tanstack/react-router'
import { lazy, Suspense } from 'react'
import { FileTabs } from '@/components/file-tabs'
import { FILE_TAB_PANEL_ID, getFileTabId } from '@/components/file-tabs/a11y'
import { MarkdownLoadingFallback } from '@/components/markdown/loading-fallback'
import { useFilesStore } from '@/stores/files'

const CodeMirrorEditor = lazy(() => import('./editor'))

export default function MarkdownEditor() {
  const activeFileId = useFilesStore(state => state.activeFileId)
  const contentStatus = useFilesStore(state => state.contentStatus)
  const contentFileId = useFilesStore(state => state.contentFileId)
  const contentEpoch = useFilesStore(state => state.contentEpoch)
  const isContentReady = contentStatus === 'ready' && contentFileId === activeFileId

  return (
    <div className="flex size-full flex-col overflow-hidden bg-editor">
      <FileTabs />
      <div
        id={FILE_TAB_PANEL_ID}
        role="tabpanel"
        aria-labelledby={activeFileId ? getFileTabId(activeFileId) : undefined}
        className="flex flex-1 items-center justify-center overflow-hidden"
      >
        {isContentReady
          ? (
              <ClientOnly fallback={<MarkdownLoadingFallback brand="bm" label="加载编辑器…" />}>
                <Suspense fallback={<MarkdownLoadingFallback brand="bm" label="加载编辑器…" />}>
                  <CodeMirrorEditor key={`${contentFileId}:${contentEpoch}`} />
                </Suspense>
              </ClientOnly>
            )
          : <MarkdownLoadingFallback brand="bm" label="加载文件…" />}
      </div>
    </div>
  )
}
