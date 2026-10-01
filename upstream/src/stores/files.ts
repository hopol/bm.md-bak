import type { FileCatalog, MarkdownFile } from '@/lib/file-storage'

import { toast } from 'sonner'
import { create } from 'zustand'
import defaultMarkdown from '@/docs/features.md?raw'
import * as storage from '@/lib/file-storage'
import { notifyFilesChanged } from '@/lib/files-sync'
import { createExternalSync } from './file-external-sync'
import { applyCatalog, createFileSession, isFileContentReady } from './file-session'
import { createFileWriters } from './file-writers'

export { defaultMarkdown }
export { isFileContentReady } from './file-session'
export type { MarkdownFile } from '@/lib/file-storage'

export interface FilesState {
  files: MarkdownFile[]
  activeFileId: string | null
  currentContent: string
  isInitialized: boolean
  revision: number
  contentStatus: 'idle' | 'loading' | 'ready'
  contentFileId: string | null
  contentVersion: number
  contentEpoch: number
  setFileContent: (fileId: string, content: string) => void
  replaceFileContentIfUnchanged: (fileId: string, expectedContent: string, nextContent: string) => boolean
  createFile: (name?: string, content?: string) => Promise<string>
  deleteFile: (id: string) => Promise<void>
  renameFile: (id: string, name: string) => Promise<void>
  switchFile: (id: string) => Promise<void>
  initialize: () => Promise<void>
  syncExternalChanges: () => Promise<void>
  flushPendingSaves: () => Promise<boolean>
}

const DEFAULT_FILE_NAME = 'bm.md'
const OPERATION_FAILURE_MESSAGE = '文件操作失败，请重试'
const SAVE_FAILURE_MESSAGE = '保存失败，请导出当前内容备份'
const LOAD_FAILURE_MESSAGE = '正文加载失败，请重试'
const STORAGE_UNAVAILABLE_MESSAGE = '浏览器存储不可用，刷新后内容会丢失'
const REMOTE_DELETE_MESSAGE = '该文件已在其他标签页删除'

// create/delete 因本地保存未落盘而中止时抛出的哨兵：保存告警已由 writers 发出，不再重复 toast。
const SAVE_ABORT_ERROR = new storage.FileStorageError()

let isPersistent = true
// 每个会话只在首次成功保存/创建后申请一次持久化存储。
let persistRequested = false
// 同一次远端删除只提示一次；自己删除走 runMutation，不会经过这两个检测点。
const notifiedRemoteDeletes = new Set<string>()

function requestPersistOnce(): void {
  if (persistRequested || !isPersistent) {
    return
  }
  persistRequested = true
  void storage.requestPersistentStorage()
}

function extractH1Title(content: string): string | null {
  for (const line of content.split('\n')) {
    if (line.startsWith('# ')) {
      return line.slice(2).trim().replace(/[*_`[\]]/g, '').trim() || null
    }
  }
  return null
}

function logStorageError(error: unknown): void {
  console.error('文件存储操作失败', error instanceof Error ? (error.cause ?? error) : error)
}

function reportOperationFailure(error: unknown): void {
  if (error instanceof storage.FileStorageError) {
    logStorageError(error)
    toast.error(OPERATION_FAILURE_MESSAGE)
  }
}

function reportLoadFailure(error: unknown): void {
  if (error instanceof storage.FileStorageError) {
    logStorageError(error)
    toast.error(LOAD_FAILURE_MESSAGE)
  }
}

const fileWriters = createFileWriters({
  onSaveResult: handleSaveResult,
  onFailure: (error) => {
    if (error instanceof storage.FileStorageError) {
      logStorageError(error)
      toast.error(SAVE_FAILURE_MESSAGE)
    }
  },
})

function defaultFile(): storage.NewFile {
  const now = Date.now()
  return {
    id: crypto.randomUUID(),
    name: extractH1Title(defaultMarkdown) ?? DEFAULT_FILE_NAME,
    content: defaultMarkdown,
    createdAt: now,
    updatedAt: now,
  }
}

export const useFilesStore = create<FilesState>()((set, get) => {
  const session = createFileSession(set, get, fileWriters)
  let initPromise: Promise<void> | null = null

  // 存储操作一成功就应用 catalog 并广播；之后的激活/正文加载失败不视为操作失败。
  async function runMutation<T>(
    run: () => Promise<{ catalog: FileCatalog, result: T }>,
    pickPreferred?: (result: T) => string | null,
    intentToken = session.tokens.intent,
  ): Promise<T> {
    const before = get().revision
    const mutation = await run()
    applyCatalog(mutation.catalog, set, get)
    if (isPersistent && mutation.catalog.revision > before) {
      notifyFilesChanged()
    }
    try {
      await session.reconcile(pickPreferred?.(mutation.result), intentToken)
    }
    catch (error) {
      reportLoadFailure(error)
    }
    return mutation.result
  }

  async function initialize(): Promise<void> {
    if (get().isInitialized) {
      return
    }
    if (initPromise) {
      return initPromise
    }
    const initialIntent = session.tokens.intent
    initPromise = (async () => {
      const { catalog, persistent } = await storage.initializeFileStorage(defaultFile())
      isPersistent = persistent
      if (!persistent) {
        toast.warning(STORAGE_UNAVAILABLE_MESSAGE)
      }
      applyCatalog(catalog, set, get)
      const preferred = initialIntent === session.tokens.intent ? session.readSessionActiveId() : undefined
      await session.reconcile(preferred, session.tokens.intent)
      set({ isInitialized: true })
    })().catch((error) => {
      reportOperationFailure(error)
      throw error
    }).finally(() => {
      initPromise = null
    })
    return initPromise
  }

  const syncExternalChanges = createExternalSync({
    getState: get,
    writers: fileWriters,
    session,
    set,
    isInitialized: () => get().isInitialized,
    // 进行中的初始化会被复用；失败后的同步即重试，提示由 initialize 自己负责。
    ensureInitialized: initialize,
    reportLoadFailure,
    onRemoteFileDeleted: reportRemoteFileDeleted,
  })

  return {
    files: [],
    activeFileId: null,
    currentContent: '',
    isInitialized: false,
    revision: 0,
    contentStatus: 'idle',
    contentFileId: null,
    contentVersion: 0,
    contentEpoch: 0,

    setFileContent: (fileId, content) => {
      const state = get()
      if (state.contentStatus !== 'ready' || fileId !== state.activeFileId || fileId !== state.contentFileId) {
        return
      }
      ++session.tokens.edit
      set({ currentContent: content })
      fileWriters.save(fileId, content)
    },

    replaceFileContentIfUnchanged: (fileId, expectedContent, nextContent) => {
      const state = get()
      if (!isFileContentReady(state) || fileId !== state.activeFileId || state.currentContent !== expectedContent) {
        return false
      }
      get().setFileContent(fileId, nextContent)
      return true
    },

    createFile: async (name, content = '') => {
      const intentToken = ++session.tokens.intent
      const previousActiveId = get().activeFileId
      try {
        if (!await fileWriters.flushFile(get().contentFileId)) {
          throw SAVE_ABORT_ERROR
        }
        const now = Date.now()
        const file = await runMutation(
          async () => {
            const { catalog, file } = await storage.createFile({
              id: crypto.randomUUID(),
              name: name ?? extractH1Title(content) ?? DEFAULT_FILE_NAME,
              content,
              createdAt: now,
              updatedAt: now,
            })
            return { catalog, result: file }
          },
          undefined,
          intentToken,
        )
        requestPersistOnce()
        if (intentToken === session.tokens.intent && get().files.some(item => item.id === file.id)) {
          ++session.tokens.load
          set(state => ({
            activeFileId: file.id,
            contentFileId: file.id,
            currentContent: content,
            contentStatus: 'ready',
            contentVersion: 1,
            contentEpoch: state.contentEpoch + 1,
          }))
          session.writeSessionActive(file.id)
        }
        return file.id
      }
      catch (error) {
        if (error !== SAVE_ABORT_ERROR) {
          reportOperationFailure(error)
        }
        await session.recoverCreateIntent(intentToken, previousActiveId)
        throw error
      }
    },

    deleteFile: async (id) => {
      if (!await fileWriters.flushFiles([get().contentFileId, id])) {
        throw SAVE_ABORT_ERROR
      }
      try {
        await runMutation(
          async () => {
            const { catalog, nextFileId } = await storage.deleteFile(id, defaultFile())
            return { catalog, result: nextFileId }
          },
          result => result,
        )
      }
      catch (error) {
        reportOperationFailure(error)
        throw error
      }
    },

    renameFile: async (id, name) => {
      try {
        await runMutation(async () => ({ catalog: await storage.renameFile(id, name), result: undefined }))
      }
      catch (error) {
        reportOperationFailure(error)
        throw error
      }
    },

    switchFile: async (id) => {
      if (!get().files.some(file => file.id === id)) {
        return
      }
      // 每次都先登记最新意图，过期意图在 flush 或加载完成后自行退出。
      const intentToken = ++session.tokens.intent
      await session.activate(id, intentToken).catch(reportLoadFailure)
    },

    initialize,

    syncExternalChanges,

    flushPendingSaves: () => fileWriters.flushAll(),
  }
})

function reportRemoteFileDeleted(id: string): void {
  const state = useFilesStore.getState()
  if (notifiedRemoteDeletes.has(id) || (id !== state.activeFileId && id !== state.contentFileId)) {
    return
  }
  notifiedRemoteDeletes.add(id)
  toast.warning(REMOTE_DELETE_MESSAGE)
}

function handleSaveResult(id: string, version: number | false): void {
  if (version === false) {
    // 文件已被其他标签删除：提示后由外部同步切换到其他文件。
    reportRemoteFileDeleted(id)
    void useFilesStore.getState().syncExternalChanges()
    return
  }
  useFilesStore.setState((state) => {
    if (state.contentFileId !== id) {
      return state
    }
    return { contentVersion: Math.max(state.contentVersion, version) }
  })
  requestPersistOnce()
  if (isPersistent) {
    notifyFilesChanged()
  }
}
