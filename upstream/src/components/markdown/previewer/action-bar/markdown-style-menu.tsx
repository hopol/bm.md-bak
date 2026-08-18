import { Palette } from 'lucide-react'
import { usePreviewStore } from '@/stores/preview'
import { markdownStyles } from '@/themes/markdown-style/metadata'
import { RadioDropdownMenu } from './radio-menu'

const label = '排版样式'

export function MarkdownStyleMenu() {
  const currentStyle = usePreviewStore(state => state.markdownStyle)
  const setMarkdownStyle = usePreviewStore(state => state.setMarkdownStyle)

  return <RadioDropdownMenu icon={<Palette className="size-4" />} label={label} items={markdownStyles} value={currentStyle} onValueChange={setMarkdownStyle} />
}
