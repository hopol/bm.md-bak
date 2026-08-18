import type { InfographicPaletteId, InfographicThemeId } from '@/themes/infographic-theme'
import { Presentation } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { usePreviewStore } from '@/stores/preview'
import { infographicPalettes, infographicThemes } from '@/themes/infographic-theme'
import { RadioMenuGroup } from './radio-menu'

const infographicTooltip = '信息图设置'
const infographicAriaLabel = '信息图设置'

export function InfographicSettingsMenu() {
  const infographic = usePreviewStore(state => state.infographic)
  const setInfographic = usePreviewStore(state => state.setInfographic)

  const handleThemeChange = (theme: string) => {
    setInfographic({ theme: theme as InfographicThemeId })
  }

  const handlePaletteChange = (palette: string) => {
    setInfographic({ palette: palette as InfographicPaletteId })
  }

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={(
            <DropdownMenuTrigger
              render={(
                <Button variant="ghost" size="icon" aria-label={infographicAriaLabel}>
                  <Presentation className="size-4" />
                </Button>
              )}
            />
          )}
        />
        <TooltipContent>{infographicTooltip}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-48">
        <RadioMenuGroup
          label="信息图主题"
          items={infographicThemes}
          value={infographic.theme}
          onValueChange={handleThemeChange}
        />
        <DropdownMenuSeparator />
        <RadioMenuGroup
          label="信息图配色"
          items={infographicPalettes}
          value={infographic.palette}
          onValueChange={handlePaletteChange}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
