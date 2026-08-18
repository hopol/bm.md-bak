import { useEffect } from 'react'

import { FILES_SIGNAL_KEY, parseFilesSignal } from '@/lib/files-sync'
import { useFilesStore } from '@/stores/files'

export function useFilesSync() {
  useEffect(() => {
    let active = true
    let inFlight = false
    let pending = false

    const requestSync = () => {
      if (inFlight) {
        pending = true
        return
      }
      inFlight = true
      void useFilesStore.getState().syncExternalChanges().catch(() => undefined).finally(() => {
        if (!active) {
          return
        }
        inFlight = false
        if (pending) {
          pending = false
          requestSync()
        }
      })
    }

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === FILES_SIGNAL_KEY && parseFilesSignal(event.newValue)) {
        requestSync()
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        requestSync()
      }
      else if (document.visibilityState === 'hidden') {
        void useFilesStore.getState().flushPendingSaves().catch(() => undefined)
      }
    }

    const handlePageHide = () => {
      void useFilesStore.getState().flushPendingSaves().catch(() => undefined)
    }

    window.addEventListener('storage', handleStorageChange)
    window.addEventListener('focus', requestSync)
    window.addEventListener('pagehide', handlePageHide)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    requestSync()

    return () => {
      active = false
      window.removeEventListener('storage', handleStorageChange)
      window.removeEventListener('focus', requestSync)
      window.removeEventListener('pagehide', handlePageHide)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])
}
