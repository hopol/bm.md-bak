import { useEditorStore } from '@/stores/editor'
import { usePreviewStore } from '@/stores/preview'

export function initClientIntegrations() {
  return Promise.all([
    useEditorStore.persist.rehydrate(),
    usePreviewStore.persist.rehydrate(),
    import('@/lib/pwa').then(({ initPWA }) => initPWA()),
    import('@/lib/file-handler').then(({ initFileHandler }) => initFileHandler()),
  ])
}
