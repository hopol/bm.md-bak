import { Wand } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { editorCommandConfig } from '@/config'
import { formatMarkdown } from '@/lib/actions'
import { trackEvent } from '@/lib/analytics'
import { isFileContentReady, useFilesStore } from '@/stores/files'

function handleFormatClick() {
  trackEvent('editor', 'format', 'button')
  const { activeFileId, currentContent, replaceFileContentIfUnchanged } = useFilesStore.getState()
  if (!activeFileId) {
    return
  }
  void formatMarkdown(
    currentContent,
    nextContent => replaceFileContentIfUnchanged(activeFileId, currentContent, nextContent),
  )
}

export function FormatButton() {
  const isReady = useFilesStore(isFileContentReady)

  return (
    <Tooltip>
      <TooltipTrigger
        render={(
          <Button
            variant="ghost"
            size="icon"
            aria-label={editorCommandConfig.format.label}
            onClick={handleFormatClick}
            disabled={!isReady}
          >
            <Wand className="size-4" />
          </Button>
        )}
      />
      <TooltipContent>{editorCommandConfig.format.label}</TooltipContent>
    </Tooltip>
  )
}
