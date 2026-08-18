import { Logo } from '@/components/logo'
import { EditorActionBar } from '../editor/action-bar'
import { PreviewerActionBar } from '../previewer/action-bar'

export function FooterBar() {
  return (
    <footer
      className="flex h-12 shrink-0 items-center border-t bg-background px-4"
    >
      <div className="flex flex-1 items-center">
        <EditorActionBar />
      </div>
      <Logo as="h1" />
      <div className="flex flex-1 items-center justify-end">
        <PreviewerActionBar />
      </div>
    </footer>
  )
}
