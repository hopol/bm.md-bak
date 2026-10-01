import type { StoreApi } from 'zustand'
import type { FileWriters } from './file-writers'
import type { FilesState } from './files'
import type { FileCatalog } from '@/lib/file-storage'

import * as storage from '@/lib/file-storage'

export type ContentStatus = 'idle' | 'loading' | 'ready'

interface FileContentReadyState {
  activeFileId: string | null
  contentFileId: string | null
  contentStatus: ContentStatus
}

export function isFileContentReady<T extends FileContentReadyState>(
  state: T,
): state is T & { activeFileId: string, contentFileId: string } {
  return state.activeFileId !== null && state.contentStatus === 'ready' && state.contentFileId === state.activeFileId
}

export type SetState = StoreApi<FilesState>['setState']
export type GetState = StoreApi<FilesState>['getState']

export interface RaceTokens {
  /** 用户“要激活哪个文件”的最新意图。 */
  intent: number
  /** 使过期正文加载作废。 */
  load: number
  /** 防止外部同步覆盖本地未保存的编辑。 */
  edit: number
}

export interface FileSession {
  tokens: RaceTokens
  reconcile: (preferredId?: string | null, intentToken?: number) => Promise<void>
  recoverCreateIntent: (intentToken: number, previousActiveId: string | null) => Promise<void>
  activate: (id: string, intentToken?: number) => Promise<void>
  readSessionActiveId: () => string | null
  writeSessionActive: (id: string | null) => void
}

const SESSION_ACTIVE_KEY = 'bm.md.files.active'

// 模块加载时捕获一次 sessionStorage：每个标签页/实例绑定自己的会话存储，
// 同时隔离 getter 抛 SecurityError 的环境。
const fileSessionStorage = (() => {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage
  }
  catch {
    return null
  }
})()

export function applyCatalog(catalog: FileCatalog, setState: SetState, getState: GetState): void {
  const state = getState()
  if (catalog.revision > state.revision || (state.files.length === 0 && !state.isInitialized && catalog.revision === state.revision)) {
    setState({ files: catalog.files, revision: catalog.revision })
  }
}

export function createFileSession(setState: SetState, getState: GetState, writers: FileWriters): FileSession {
  const tokens: RaceTokens = { intent: 0, load: 0, edit: 0 }
  // 当前在途正文加载：只有 id/意图/令牌三者都仍有效的 loading 才算“内容已是最新”。
  const pendingLoad = { id: null as string | null, intent: 0, load: 0 }

  function readSessionActiveId(): string | null {
    try {
      return fileSessionStorage?.getItem(SESSION_ACTIVE_KEY) ?? null
    }
    catch {
      return null
    }
  }

  function writeSessionActive(id: string | null): void {
    try {
      if (id) {
        fileSessionStorage?.setItem(SESSION_ACTIVE_KEY, id)
      }
      else {
        fileSessionStorage?.removeItem(SESSION_ACTIVE_KEY)
      }
    }
    catch {
      // 会话存储不可用时仅保留内存状态。
    }
  }

  // ready 或 loading 的内容必须绑定当前激活意图；意图过期后的 loading 需要重新加载。
  function isActiveContentCurrent(id: string): boolean {
    const state = getState()
    if (state.activeFileId !== id || state.contentFileId !== id) {
      return false
    }
    if (state.contentStatus === 'ready') {
      return true
    }
    return state.contentStatus === 'loading'
      && pendingLoad.id === id
      && pendingLoad.intent === tokens.intent
  }

  async function activate(id: string, intentToken = tokens.intent): Promise<void> {
    if (intentToken !== tokens.intent) {
      return
    }
    if (!getState().files.some(file => file.id === id)) {
      await reconcile(undefined, intentToken)
      return
    }
    if (isActiveContentCurrent(id)) {
      return
    }

    if (!await writers.flushFiles([getState().contentFileId, id])) {
      return
    }
    if (intentToken !== tokens.intent || !getState().files.some(file => file.id === id)) {
      return
    }
    const loadToken = ++tokens.load
    pendingLoad.id = id
    pendingLoad.intent = intentToken
    pendingLoad.load = loadToken
    setState({ activeFileId: id, contentFileId: id, currentContent: '', contentStatus: 'loading', contentVersion: 0 })
    writeSessionActive(id)
    if (loadToken !== tokens.load || intentToken !== tokens.intent) {
      return
    }

    try {
      const snapshot = await storage.readFile(id)
      const current = getState()
      if (loadToken !== tokens.load || intentToken !== tokens.intent || current.activeFileId !== id || current.contentFileId !== id) {
        return
      }
      if (!current.files.some(file => file.id === id)) {
        await reconcile(undefined, intentToken)
        return
      }
      setState(state => ({
        currentContent: snapshot.content,
        contentStatus: 'ready',
        contentVersion: snapshot.version,
        contentEpoch: state.contentEpoch + 1,
      }))
    }
    catch (error) {
      if (loadToken === tokens.load && intentToken === tokens.intent) {
        pendingLoad.id = null
        setState({ contentStatus: 'idle', contentFileId: null, currentContent: '', contentVersion: 0 })
      }
      throw error
    }
  }

  async function reconcile(preferredId?: string | null, intentToken = tokens.intent): Promise<void> {
    if (intentToken !== tokens.intent) {
      return
    }
    const state = getState()
    if (state.activeFileId !== null && state.files.some(file => file.id === state.activeFileId)) {
      if (!isActiveContentCurrent(state.activeFileId)) {
        await activate(state.activeFileId, intentToken)
      }
      return
    }

    const nextId = [preferredId, readSessionActiveId(), state.files[0]?.id]
      .find(candidate => candidate && state.files.some(file => file.id === candidate)) ?? null
    if (!nextId) {
      ++tokens.load
      pendingLoad.id = null
      setState({ activeFileId: null, contentFileId: null, currentContent: '', contentStatus: 'idle', contentVersion: 0 })
      writeSessionActive(null)
      return
    }
    await activate(nextId, intentToken)
  }

  // create 抢占激活意图后失败时，恢复此前被作废的活动文件加载。
  async function recoverCreateIntent(intentToken: number, previousActiveId: string | null): Promise<void> {
    if (intentToken !== tokens.intent) {
      return
    }
    const state = getState()
    if (state.contentStatus !== 'loading' || state.activeFileId !== previousActiveId) {
      return
    }
    ++tokens.load
    pendingLoad.id = null
    setState({ contentFileId: null, currentContent: '', contentStatus: 'idle', contentVersion: 0 })
    await reconcile(previousActiveId, intentToken)
  }

  return { tokens, activate, reconcile, recoverCreateIntent, readSessionActiveId, writeSessionActive }
}
