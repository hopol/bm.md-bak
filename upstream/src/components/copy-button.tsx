import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { copyText } from '@/lib/clipboard'

interface CopyButtonProps {
  text: string
  className?: string
  ariaLabel?: string
}

export function CopyButton({ text, className, ariaLabel = '复制' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    const success = await copyText(text)
    if (success) {
      setCopied(true)
      toast.success('复制成功')
      setTimeout(setCopied, 2000, false)
    }
    else {
      toast.error('复制失败')
    }
  }

  return (
    <Button variant="ghost" size="icon-sm" onClick={handleCopy} className={className} aria-label={ariaLabel}>
      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
    </Button>
  )
}
