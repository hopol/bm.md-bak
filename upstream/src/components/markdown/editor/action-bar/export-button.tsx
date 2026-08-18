import { FileDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { editorCommandConfig } from '@/config'
import { exportMarkdown } from '@/lib/actions'
import { trackEvent } from '@/lib/analytics'
import { isFileContentReady, useFilesStore } from '@/stores/files'

export function ExportButton() {
  const content = useFilesStore(state => state.currentContent)
  const isReady = useFilesStore(isFileContentReady)

  const onExportClick = () => {
    trackEvent('export', 'markdown', 'button')
    exportMarkdown(content)
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={(
          <Button
            variant="ghost"
            size="icon"
            aria-label={editorCommandConfig.export.label}
            onClick={onExportClick}
            disabled={!isReady}
          >
            <FileDown className="size-4" />
          </Button>
        )}
      />
      <TooltipContent>{editorCommandConfig.export.label}</TooltipContent>
    </Tooltip>
  )
}
