import { ClientOnly, createFileRoute, Outlet } from '@tanstack/react-router'
import { createClientOnlyFn } from '@tanstack/react-start'
import { lazy, Suspense } from 'react'
import { MarkdownLoadingFallback } from '@/components/markdown/loading-fallback'

const loadWorkspace = createClientOnlyFn(() => import('@/components/markdown/workspace.client'))
const Workspace = lazy(loadWorkspace)

export const Route = createFileRoute('/_layout')({ component: App })

function App() {
  return (
    <div className="flex h-dvh min-h-[700px] min-w-5xl flex-col overflow-hidden">
      <ClientOnly fallback={<WorkspaceFallback />}>
        <Suspense fallback={<WorkspaceFallback />}>
          <Workspace />
        </Suspense>
      </ClientOnly>
      <Outlet />
    </div>
  )
}

function WorkspaceFallback() {
  return (
    <>
      <main className="min-h-0 flex-1 overflow-hidden">
        <div className="flex size-full bg-background">
          <div className="min-w-0 basis-1/2">
            <MarkdownLoadingFallback brand="bm" label="加载编辑器…" />
          </div>
          <div aria-hidden="true" className="w-px shrink-0 bg-border" />
          <div className="min-w-0 basis-1/2">
            <MarkdownLoadingFallback animationDelayMs={200} brand="md" label="加载预览…" />
          </div>
        </div>
      </main>
      <div aria-hidden="true" className="h-12 shrink-0 border-t bg-background" />
    </>
  )
}
