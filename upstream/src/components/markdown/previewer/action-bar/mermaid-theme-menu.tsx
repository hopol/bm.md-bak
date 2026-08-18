import { Workflow } from 'lucide-react'
import { usePreviewStore } from '@/stores/preview'
import { mermaidThemes } from '@/themes/mermaid-theme'
import { RadioDropdownMenu } from './radio-menu'

const label = '流程图主题'

export function MermaidThemeMenu() {
  const currentTheme = usePreviewStore(state => state.mermaidTheme)
  const setMermaidTheme = usePreviewStore(state => state.setMermaidTheme)

  return <RadioDropdownMenu icon={<Workflow className="size-4" />} label={label} items={mermaidThemes} value={currentTheme} onValueChange={setMermaidTheme} />
}
