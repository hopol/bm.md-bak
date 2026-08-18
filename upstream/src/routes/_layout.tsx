import { ClientOnly, createFileRoute, Outlet } from '@tanstack/react-router'
import { useEffect } from 'react'
import { CommandPalette } from '@/components/command-palette'
import MarkdownEditor from '@/components/markdown/editor'
import { FooterBar } from '@/components/markdown/footer-bar'
import MarkdownPreviewer from '@/components/markdown/previewer'
import { restorePreviewScrollState } from '@/components/markdown/previewer/restore-scroll-state'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { useFilesSync } from '@/hooks/use-files-sync'
import { prepareMarkdownWorker } from '@/lib/markdown/prepare-worker'

export const Route = createFileRoute('/_layout')({ component: App })

function App() {
  useFilesSync()

  useEffect(() => {
    void prepareMarkdownWorker()
  }, [])

  return (
    <div className="flex h-dvh min-h-[700px] min-w-5xl flex-col overflow-hidden">
      <main className="min-h-0 flex-1 overflow-hidden">
        <ResizablePanelGroup
          orientation="horizontal"
          onLayoutChanged={(_, meta) => {
            if (meta.isUserInteraction)
              restorePreviewScrollState()
          }}
        >
          <ResizablePanel defaultSize="50%" minSize="512px">
            <MarkdownEditor />
          </ResizablePanel>
          <ResizableHandle />
          <ResizablePanel defaultSize="50%" minSize="512px">
            <MarkdownPreviewer />
          </ResizablePanel>
        </ResizablePanelGroup>
      </main>
      <FooterBar />
      <ClientOnly>
        <CommandPalette />
      </ClientOnly>
      <Outlet />
    </div>
  )
}
