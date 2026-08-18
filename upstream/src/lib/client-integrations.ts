import { useEditorStore } from '@/stores/editor'
import { usePreviewStore } from '@/stores/preview'

export function initClientIntegrations() {
  void useEditorStore.persist.rehydrate()
  void usePreviewStore.persist.rehydrate()

  void Promise.all([
    import('@/lib/pwa').then(({ initPWA }) => initPWA()),
    import('@/lib/file-handler').then(({ initFileHandler }) => initFileHandler()),
  ])
}
