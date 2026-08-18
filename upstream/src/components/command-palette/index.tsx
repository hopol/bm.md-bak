import { useState } from 'react'
import { ResetContentDialog } from '@/components/dialog/reset-content-dialog'
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandInput,
  CommandList,
} from '@/components/ui/command'
import { useCommandPaletteStore } from '@/stores/command-palette'
import { MainMenu } from './main-menu'
import {
  CodeThemeMenu,
  InfographicPaletteMenu,
  InfographicThemeMenu,
  MarkdownStyleMenu,
  MermaidThemeMenu,
} from './submenus'
import { useCommandPaletteActions } from './use-command-palette-actions'

export function CommandPalette() {
  const open = useCommandPaletteStore(state => state.open)
  const setOpen = useCommandPaletteStore(state => state.setOpen)
  const subMenu = useCommandPaletteStore(state => state.subMenu)
  const setSubMenu = useCommandPaletteStore(state => state.setSubMenu)
  const [resetDialogOpen, setResetDialogOpen] = useState(false)
  const actions = useCommandPaletteActions(setResetDialogOpen)

  return (
    <>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="命令面板"
        description="搜索命令…"
      >
        <Command>
          <CommandInput placeholder="搜索命令…" />
          <CommandList>
            <CommandEmpty>未找到相关命令</CommandEmpty>
            {subMenu === null && <MainMenu actions={actions} setSubMenu={setSubMenu} />}
            {subMenu === 'markdownStyle' && <MarkdownStyleMenu actions={actions} />}
            {subMenu === 'codeTheme' && <CodeThemeMenu actions={actions} />}
            {subMenu === 'mermaidTheme' && <MermaidThemeMenu actions={actions} />}
            {subMenu === 'infographicTheme' && <InfographicThemeMenu actions={actions} />}
            {subMenu === 'infographicPalette' && <InfographicPaletteMenu actions={actions} />}
          </CommandList>
        </Command>
      </CommandDialog>
      <ResetContentDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen} />
    </>
  )
}
