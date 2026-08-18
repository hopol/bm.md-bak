import { useEffect, useRef } from 'react'
import { useCommandPaletteStore } from '@/stores/command-palette'

interface HotkeyHandler {
  key: string
  shift?: boolean
  handler: () => void
}

export function useHotkeys(handlers: HotkeyHandler[]) {
  const toggle = useCommandPaletteStore(state => state.toggle)
  const handlersRef = useRef(handlers)

  useEffect(() => {
    handlersRef.current = handlers
  })

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || event.repeat)
        return

      const isMod = event.metaKey || event.ctrlKey

      if (isMod && event.key.toLowerCase() === 'k' && !event.shiftKey) {
        event.preventDefault()
        toggle()
        return
      }

      for (const hotkey of handlersRef.current) {
        const shift = hotkey.shift ?? false
        if (
          isMod
          && event.key.toLowerCase() === hotkey.key.toLowerCase()
          && event.shiftKey === shift
        ) {
          event.preventDefault()
          hotkey.handler()
          return
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [toggle])
}
