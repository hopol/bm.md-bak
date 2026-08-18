import type { LucideIcon } from 'lucide-react'
import type { CommandPaletteActions } from './use-command-palette-actions'
import { ChevronLeft, Code, ImageIcon, Palette, PaletteIcon, Workflow } from 'lucide-react'
import {
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from '@/components/ui/command'
import { codeThemes } from '@/themes/code-theme/metadata'
import { infographicPalettes, infographicThemes } from '@/themes/infographic-theme'
import { markdownStyles } from '@/themes/markdown-style/metadata'
import { mermaidThemes } from '@/themes/mermaid-theme'

interface SubmenuProps {
  actions: CommandPaletteActions
}

export function MarkdownStyleMenu({ actions }: SubmenuProps) {
  return (
    <OptionSubmenu
      heading="排版样式"
      items={markdownStyles}
      currentValue={actions.markdownStyle}
      Icon={Palette}
      onSelect={actions.handleSelectMarkdownStyle}
      onBack={actions.resetSubMenu}
    />
  )
}

export function CodeThemeMenu({ actions }: SubmenuProps) {
  return (
    <OptionSubmenu
      heading="代码主题"
      items={codeThemes}
      currentValue={actions.codeTheme}
      Icon={Code}
      onSelect={actions.handleSelectCodeTheme}
      onBack={actions.resetSubMenu}
    />
  )
}

export function MermaidThemeMenu({ actions }: SubmenuProps) {
  return (
    <OptionSubmenu
      heading="流程图主题"
      items={mermaidThemes}
      currentValue={actions.mermaidTheme}
      Icon={Workflow}
      onSelect={actions.handleSelectMermaidTheme}
      onBack={actions.resetSubMenu}
    />
  )
}

export function InfographicThemeMenu({ actions }: SubmenuProps) {
  return (
    <OptionSubmenu
      heading="信息图主题"
      items={infographicThemes}
      currentValue={actions.infographic.theme}
      Icon={ImageIcon}
      onSelect={actions.handleSelectInfographicTheme}
      onBack={actions.resetSubMenu}
    />
  )
}

export function InfographicPaletteMenu({ actions }: SubmenuProps) {
  return (
    <OptionSubmenu
      heading="信息图色板"
      items={infographicPalettes}
      currentValue={actions.infographic.palette}
      Icon={PaletteIcon}
      onSelect={actions.handleSelectInfographicPalette}
      onBack={actions.resetSubMenu}
    />
  )
}

interface OptionSubmenuProps<TId extends string> {
  heading: string
  items: readonly { id: TId, name: string }[]
  currentValue: string
  Icon: LucideIcon
  onSelect: (id: TId) => void
  onBack: () => void
}

function OptionSubmenu<TId extends string>({ heading, items, currentValue, Icon, onSelect, onBack }: OptionSubmenuProps<TId>) {
  return (
    <CommandGroup heading={heading}>
      <CommandItem onSelect={onBack}>
        <ChevronLeft className="size-4" />
        返回
      </CommandItem>
      <CommandSeparator />
      {items.map(item => (
        <CommandItem
          key={item.id}
          onSelect={() => onSelect(item.id)}
          data-checked={currentValue === item.id}
        >
          <Icon className="size-4" />
          {item.name}
          {currentValue === item.id ? <span className="sr-only">，当前选中</span> : null}
        </CommandItem>
      ))}
    </CommandGroup>
  )
}
