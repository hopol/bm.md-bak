import { ClientOnly } from '@tanstack/react-router'
import { lazy, Suspense } from 'react'
import { MarkdownLoadingFallback } from '@/components/markdown/loading-fallback'
import { isFileContentReady, useFilesStore } from '@/stores/files'
import MarkdownPreviewerSidebar from './sidebar'

const MarkdownRender = lazy(() => import('./render'))

export default function MarkdownPreviewer() {
  const isReady = useFilesStore(isFileContentReady)

  return (
    <div className="flex size-full overflow-hidden bg-editor">
      <div className="flex flex-1 items-center justify-center p-4">
        {isReady
          ? (
              <ClientOnly fallback={<MarkdownLoadingFallback animationDelayMs={200} brand="md" label="加载预览…" />}>
                <Suspense fallback={<MarkdownLoadingFallback animationDelayMs={200} brand="md" label="加载预览…" />}>
                  <MarkdownRender />
                </Suspense>
              </ClientOnly>
            )
          : <MarkdownLoadingFallback animationDelayMs={200} brand="md" label="加载预览…" />}
      </div>
      <MarkdownPreviewerSidebar />
    </div>
  )
}
