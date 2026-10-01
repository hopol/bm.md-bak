import { useEffect } from 'react'

import { onFilesChanged } from '@/lib/files-sync'
import { useFilesStore } from '@/stores/files'

function requestSync(): void {
  void useFilesStore.getState().syncExternalChanges().catch(() => undefined)
}

export function useFilesSync() {
  useEffect(() => {
    const flush = () => {
      void useFilesStore.getState().flushPendingSaves().catch(() => undefined)
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        requestSync()
      }
      else {
        flush()
      }
    }

    const unsubscribe = onFilesChanged(requestSync)
    window.addEventListener('focus', requestSync)
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    requestSync()

    return () => {
      unsubscribe()
      window.removeEventListener('focus', requestSync)
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])
}
