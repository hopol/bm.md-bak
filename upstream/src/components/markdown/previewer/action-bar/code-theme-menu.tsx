import { Code } from 'lucide-react'
import { usePreviewStore } from '@/stores/preview'
import { codeThemes } from '@/themes/code-theme/metadata'
import { RadioDropdownMenu } from './radio-menu'

const label = '代码主题'

export function CodeThemeMenu() {
  const currentTheme = usePreviewStore(state => state.codeTheme)
  const setCodeTheme = usePreviewStore(state => state.setCodeTheme)

  return <RadioDropdownMenu icon={<Code className="size-4" />} label={label} items={codeThemes} value={currentTheme} onValueChange={setCodeTheme} />
}
