import { Separator } from '@/components/ui/separator'
import { CodeThemeMenu } from './code-theme-menu'
import { CopyButton } from './copy-button'
import { CustomCssDialog } from './custom-css-dialog'
import { ExportButton } from './export-button'
import { InfographicSettingsMenu } from './infographic-settings-menu'
import { MarkdownStyleMenu } from './markdown-style-menu'
import { MermaidThemeMenu } from './mermaid-theme-menu'

export function PreviewerActionBar() {
  return (
    <>
      <CopyButton platform="wechat" />
      <CopyButton platform="html" />
      <ExportButton />
      <Separator orientation="vertical" className="mx-2" />
      <MarkdownStyleMenu />
      <CodeThemeMenu />
      <MermaidThemeMenu />
      <InfographicSettingsMenu />
      <CustomCssDialog />
    </>
  )
}
