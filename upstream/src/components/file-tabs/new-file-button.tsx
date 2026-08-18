import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface NewFileButtonProps {
  onClick: () => void
}

export function NewFileButton({ onClick }: NewFileButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={(
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="新建文件"
            onClick={onClick}
          >
            <Plus className="size-3.5" />
          </Button>
        )}
      />
      <TooltipContent>新建文件</TooltipContent>
    </Tooltip>
  )
}
