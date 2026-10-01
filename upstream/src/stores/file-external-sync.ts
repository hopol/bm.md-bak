import type { FileSession, GetState, SetState } from './file-session'
import type { FileWriters } from './file-writers'

import * as storage from '@/lib/file-storage'
import { applyCatalog, isFileContentReady } from './file-session'

interface ExternalSyncDeps {
  getState: GetState
  writers: FileWriters
  session: FileSession
  set: SetState
  isInitialized: () => boolean
  ensureInitialized: () => Promise<void>
  reportLoadFailure: (error: unknown) => void
  onRemoteFileDeleted: (fileId: string) => void
}

export function createExternalSync({
  getState,
  writers,
  session,
  set,
  isInitialized,
  ensureInitialized,
  reportLoadFailure,
  onRemoteFileDeleted,
}: ExternalSyncDeps): () => Promise<void> {
  async function syncFromStorage(): Promise<void> {
    try {
      if (!isInitialized()) {
        // 初始化失败由其自身路径提示，同步路径静默返回。
        await ensureInitialized().catch(() => undefined)
      }
      if (!isInitialized()) {
        return
      }

      const catalog = await storage.getFileCatalog()
      applyCatalog(catalog, set, getState)
      const afterApply = getState()
      if (afterApply.activeFileId !== null && !afterApply.files.some(file => file.id === afterApply.activeFileId)) {
        onRemoteFileDeleted(afterApply.activeFileId)
      }
      await session.reconcile()

      const state = getState()
      if (!isFileContentReady(state)) {
        return
      }
      const fileId = state.contentFileId
      if (writers.hasPending(fileId) && !await writers.flushFile(fileId)) {
        return
      }
      const settled = getState()
      if (!isFileContentReady(settled) || settled.contentFileId !== fileId) {
        return
      }
      const editEpoch = session.tokens.edit
      const snapshot = await storage.readFile(fileId)
      const current = getState()
      if (
        editEpoch === session.tokens.edit
        && isFileContentReady(current)
        && current.contentFileId === fileId
        && snapshot.version > current.contentVersion
      ) {
        set(prev => ({
          currentContent: snapshot.content,
          contentVersion: snapshot.version,
          contentEpoch: prev.contentEpoch + 1,
        }))
      }
    }
    catch (error) {
      reportLoadFailure(error)
    }
  }

  // 通知、聚焦、可见性等触发源可能并发请求，合并为串行执行且最多追赶一次。
  let syncPromise: Promise<void> | null = null
  let syncAgain = false

  return function syncExternalChanges(): Promise<void> {
    if (syncPromise) {
      syncAgain = true
      return syncPromise
    }
    syncPromise = (async () => {
      do {
        syncAgain = false
        await syncFromStorage()
      } while (syncAgain)
    })().finally(() => {
      syncPromise = null
    })
    return syncPromise
  }
}
