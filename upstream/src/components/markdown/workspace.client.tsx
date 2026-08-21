import { useEffect } from 'react'
import { CommandPalette } from '@/components/command-palette'
import MarkdownEditor from '@/components/markdown/editor'
import { FooterBar } from '@/components/markdown/footer-bar'
import MarkdownPreviewer from '@/components/markdown/previewer'
import { restorePreviewScrollState } from '@/components/markdown/previewer/restore-scroll-state'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { useFilesSync } from '@/hooks/use-files-sync'
import { prepareMarkdownWorker } from '@/lib/markdown/prepare-worker'

export default function Workspace() {
  useFilesSync()

  useEffect(() => {
    void prepareMarkdownWorker()
  }, [])

  return (
    <>
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
      <CommandPalette />
    </>
  )
}
