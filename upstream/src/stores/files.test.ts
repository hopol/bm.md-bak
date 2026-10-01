import type { FileCatalog, FileSnapshot, MarkdownFile } from '@/lib/file-storage'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  FileStorageError: class FileStorageError extends Error {
    constructor() {
      super('文件操作失败，请重试')
      this.name = 'FileStorageError'
    }
  },
  createFile: vi.fn(),
  deleteFile: vi.fn(),
  getFileCatalog: vi.fn(),
  initializeFileStorage: vi.fn(),
  readFile: vi.fn(),
  renameFile: vi.fn(),
  requestPersistentStorage: vi.fn(),
  saveFile: vi.fn(),
  notifyFilesChanged: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
}))

vi.mock('@/lib/file-storage', () => ({
  FileStorageError: mocks.FileStorageError,
  createFile: mocks.createFile,
  deleteFile: mocks.deleteFile,
  getFileCatalog: mocks.getFileCatalog,
  initializeFileStorage: mocks.initializeFileStorage,
  readFile: mocks.readFile,
  renameFile: mocks.renameFile,
  requestPersistentStorage: mocks.requestPersistentStorage,
  saveFile: mocks.saveFile,
}))

vi.mock('@/lib/files-sync', () => ({
  notifyFilesChanged: mocks.notifyFilesChanged,
}))
vi.mock('sonner', () => ({ toast: { warning: mocks.warning, error: mocks.error } }))

interface StoreModule {
  isFileContentReady: typeof import('./files')['isFileContentReady']
  useFilesStore: typeof import('./files')['useFilesStore']
}

function file(id: string, name = `${id}.md`): MarkdownFile {
  return { id, name, createdAt: 1, updatedAt: 1 }
}

function catalog(revision: number, files: MarkdownFile[]): FileCatalog {
  return { revision, files }
}

function snapshot(content: string, version = 1): FileSnapshot {
  return { content, version }
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, reject, resolve }
}

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initial))
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: key => values.get(key) ?? null,
    key: index => [...values.keys()][index] ?? null,
    removeItem: key => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  }
}

let storeModule: StoreModule

beforeEach(async () => {
  vi.resetModules()
  vi.resetAllMocks()
  vi.stubGlobal('sessionStorage', memoryStorage())
  mocks.saveFile.mockResolvedValue(2)
  mocks.readFile.mockResolvedValue(snapshot('正文'))
  const initialCatalog = catalog(1, [file('one')])
  mocks.initializeFileStorage.mockResolvedValue({ catalog: initialCatalog, persistent: true })
  mocks.getFileCatalog.mockResolvedValue(initialCatalog)
  storeModule = await import('./files')
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

function ready(files = [file('one')], active = 'one', revision = 1) {
  storeModule.useFilesStore.setState({
    files,
    activeFileId: active,
    contentFileId: active,
    currentContent: '旧正文',
    contentStatus: 'ready',
    contentVersion: 1,
    contentEpoch: 1,
    revision,
    isInitialized: true,
  })
}

describe('files store', () => {
  it('同文件保存串行且其他文件不等待其提交', async () => {
    const first = deferred<number>()
    mocks.saveFile.mockImplementation((id: string, content: string) => {
      return id === 'one' && content === '第一笔' ? first.promise : Promise.resolve(3)
    })
    ready([file('one'), file('two')])
    const store = storeModule.useFilesStore
    store.getState().setFileContent('one', '第一笔')
    store.getState().setFileContent('one', '最新正文')
    expect(mocks.saveFile).toHaveBeenCalledTimes(1)

    ready([file('one'), file('two')], 'two')
    store.getState().setFileContent('two', '另一文件')
    expect(mocks.saveFile.mock.calls).toEqual([
      ['one', '第一笔'],
      ['two', '另一文件'],
    ])

    const flushing = store.getState().flushPendingSaves()
    first.resolve(2)
    await expect(flushing).resolves.toBe(true)
    expect(mocks.saveFile.mock.calls).toEqual([
      ['one', '第一笔'],
      ['two', '另一文件'],
      ['one', '最新正文'],
    ])
    expect(store.getState().contentVersion).toBe(3)
  })

  it('ready 要求存在非空 activeFileId', () => {
    expect(storeModule.isFileContentReady({ activeFileId: null, contentFileId: null, contentStatus: 'ready' })).toBe(false)
    expect(storeModule.isFileContentReady({ activeFileId: 'one', contentFileId: 'one', contentStatus: 'ready' })).toBe(true)
  })

  it('sessionStorage 抛 SecurityError 时初始化回落到首个文件', async () => {
    vi.resetModules()
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      get() {
        throw new DOMException('禁止访问', 'SecurityError')
      },
    })
    storeModule = await import('./files')

    await storeModule.useFilesStore.getState().initialize()

    expect(storeModule.useFilesStore.getState()).toMatchObject({
      isInitialized: true,
      activeFileId: 'one',
      contentStatus: 'ready',
    })
  })

  it('initialize 时 session active 优先并原子加载 snapshot', async () => {
    const files = [file('stale'), file('session')]
    sessionStorage.setItem('bm.md.files.active', 'session')
    mocks.initializeFileStorage.mockResolvedValue({ catalog: catalog(3, files), persistent: true })
    mocks.readFile.mockResolvedValue(snapshot('会话正文', 4))

    await storeModule.useFilesStore.getState().initialize()

    expect(storeModule.useFilesStore.getState()).toMatchObject({
      isInitialized: true,
      activeFileId: 'session',
      contentFileId: 'session',
      currentContent: '会话正文',
      contentVersion: 4,
      contentEpoch: 1,
      contentStatus: 'ready',
      revision: 3,
    })
  })

  it('存储降级为内存模式时初始化提示一次且写操作不广播', async () => {
    mocks.initializeFileStorage.mockResolvedValue({ catalog: catalog(1, [file('one')]), persistent: false })
    await storeModule.useFilesStore.getState().initialize()
    expect(mocks.warning).toHaveBeenCalledWith('浏览器存储不可用，刷新后内容会丢失')

    storeModule.useFilesStore.getState().setFileContent('one', '正文')
    await storeModule.useFilesStore.getState().flushPendingSaves()
    mocks.renameFile.mockResolvedValue(catalog(2, [file('one', '新.md')]))
    await storeModule.useFilesStore.getState().renameFile('one', '新')
    expect(mocks.notifyFilesChanged).not.toHaveBeenCalled()
    expect(mocks.requestPersistentStorage).not.toHaveBeenCalled()
  })

  it('首次保存成功即触发持久化申请，之后每个会话不再重复', async () => {
    ready()
    const store = storeModule.useFilesStore

    store.getState().setFileContent('one', '正文')
    await store.getState().flushPendingSaves()
    expect(mocks.requestPersistentStorage).toHaveBeenCalledTimes(1)

    const created = file('created')
    mocks.createFile.mockResolvedValue({ catalog: catalog(2, [file('one'), created]), file: created })
    await store.getState().createFile('新建')
    await store.getState().flushPendingSaves()
    expect(mocks.requestPersistentStorage).toHaveBeenCalledTimes(1)
  })

  it('initialize 期间的 early sync 等待初始化且最终 initialized', async () => {
    const opening = deferred<{ catalog: FileCatalog, persistent: boolean }>()
    mocks.initializeFileStorage.mockReturnValue(opening.promise)
    const initializing = storeModule.useFilesStore.getState().initialize()
    const syncing = storeModule.useFilesStore.getState().syncExternalChanges()
    opening.resolve({ catalog: catalog(1, [file('one')]), persistent: true })
    await Promise.all([initializing, syncing])
    expect(storeModule.useFilesStore.getState()).toMatchObject({ isInitialized: true, activeFileId: 'one', contentStatus: 'ready' })
    expect(mocks.initializeFileStorage).toHaveBeenCalledOnce()
    expect(mocks.getFileCatalog).toHaveBeenCalledOnce()
  })

  it('initialize 失败后保持未初始化并允许重试成功', async () => {
    mocks.initializeFileStorage
      .mockRejectedValueOnce(new mocks.FileStorageError())
      .mockResolvedValueOnce({ catalog: catalog(1, [file('one')]), persistent: true })

    await expect(storeModule.useFilesStore.getState().initialize()).rejects.toBeInstanceOf(mocks.FileStorageError)
    expect(storeModule.useFilesStore.getState().isInitialized).toBe(false)

    await expect(storeModule.useFilesStore.getState().initialize()).resolves.toBeUndefined()
    expect(mocks.initializeFileStorage).toHaveBeenCalledTimes(2)
    expect(storeModule.useFilesStore.getState()).toMatchObject({ isInitialized: true, activeFileId: 'one', contentStatus: 'ready' })
  })

  it('初始化失败只提示一次，之后的同步会重试初始化', async () => {
    mocks.initializeFileStorage.mockRejectedValueOnce(new mocks.FileStorageError())

    const initializing = storeModule.useFilesStore.getState().initialize()
    const syncing = storeModule.useFilesStore.getState().syncExternalChanges()
    await expect(initializing).rejects.toBeInstanceOf(mocks.FileStorageError)
    await expect(syncing).resolves.toBeUndefined()
    expect(mocks.error).toHaveBeenCalledTimes(1)
    expect(storeModule.useFilesStore.getState().isInitialized).toBe(false)

    await storeModule.useFilesStore.getState().syncExternalChanges()
    expect(storeModule.useFilesStore.getState().isInitialized).toBe(true)
    expect(mocks.error).toHaveBeenCalledTimes(1)
  })

  it('initialize 的 active reconcile 失败后可重试', async () => {
    mocks.readFile
      .mockRejectedValueOnce(new mocks.FileStorageError())
      .mockResolvedValueOnce(snapshot('重试正文', 5))

    await expect(storeModule.useFilesStore.getState().initialize()).rejects.toBeInstanceOf(mocks.FileStorageError)
    expect(storeModule.useFilesStore.getState()).toMatchObject({ isInitialized: false, activeFileId: 'one', contentFileId: null, contentStatus: 'idle' })

    await storeModule.useFilesStore.getState().initialize()
    expect(storeModule.useFilesStore.getState()).toMatchObject({ isInitialized: true, activeFileId: 'one', contentFileId: 'one', currentContent: '重试正文', contentStatus: 'ready' })
  })

  it('并发 sync 合并为串行执行并在完成后追赶一次', async () => {
    ready()
    const first = deferred<FileCatalog>()
    mocks.getFileCatalog.mockReturnValueOnce(first.promise).mockResolvedValue(catalog(2, [file('one')]))
    const syncing = storeModule.useFilesStore.getState().syncExternalChanges()
    const chasing = storeModule.useFilesStore.getState().syncExternalChanges()
    expect(mocks.getFileCatalog).toHaveBeenCalledTimes(1)

    first.resolve(catalog(1, [file('one')]))
    await Promise.all([syncing, chasing])
    expect(mocks.getFileCatalog).toHaveBeenCalledTimes(2)
  })

  it('删除活动文件与被动同步交错后按实时 catalog fallback', async () => {
    ready([file('one'), file('two')])
    const deleting = deferred<{ catalog: FileCatalog, nextFileId: string | null }>()
    mocks.deleteFile.mockReturnValue(deleting.promise)
    mocks.getFileCatalog.mockResolvedValue(catalog(1, [file('one'), file('two')]))
    mocks.readFile.mockImplementation(id => Promise.resolve(snapshot(id === 'two' ? '第二篇' : '远端旧正文')))
    const deletion = storeModule.useFilesStore.getState().deleteFile('one')
    await storeModule.useFilesStore.getState().syncExternalChanges()
    deleting.resolve({ catalog: catalog(2, [file('two')]), nextFileId: 'two' })
    await deletion
    expect(storeModule.useFilesStore.getState()).toMatchObject({ activeFileId: 'two', contentFileId: 'two', currentContent: '第二篇', contentStatus: 'ready' })
  })

  it.each(['delete-first', 'switch-first'])('删除非活动目标与切换交错：%s', async (order) => {
    ready([file('one'), file('two')])
    const targetLoad = deferred<FileSnapshot>()
    const deleting = deferred<{ catalog: FileCatalog, nextFileId: string | null }>()
    mocks.readFile.mockImplementation(id => id === 'two' ? targetLoad.promise : Promise.resolve(snapshot('第一篇')))
    mocks.deleteFile.mockReturnValue(deleting.promise)
    const switching = storeModule.useFilesStore.getState().switchFile('two')
    const deletion = storeModule.useFilesStore.getState().deleteFile('two')
    if (order === 'delete-first') {
      deleting.resolve({ catalog: catalog(2, [file('one')]), nextFileId: 'one' })
      await deletion
      targetLoad.resolve(snapshot('已删除正文'))
    }
    else {
      targetLoad.resolve(snapshot('第二篇'))
      await switching
      deleting.resolve({ catalog: catalog(2, [file('one')]), nextFileId: 'one' })
      await deletion
    }
    await switching
    expect(storeModule.useFilesStore.getState()).toMatchObject({ activeFileId: 'one', contentFileId: 'one', currentContent: '第一篇', contentStatus: 'ready' })
  })

  it('create 与 no-op sync 交错仍保持最后用户激活', async () => {
    ready()
    const creating = deferred<{ catalog: FileCatalog, file: MarkdownFile }>()
    mocks.createFile.mockReturnValue(creating.promise)
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000001')
    const created = file('00000000-0000-4000-8000-000000000001')
    const creation = storeModule.useFilesStore.getState().createFile('新文件', '新正文')
    await storeModule.useFilesStore.getState().syncExternalChanges()
    creating.resolve({ catalog: catalog(2, [file('one'), created]), file: created })
    await creation
    expect(storeModule.useFilesStore.getState()).toMatchObject({
      activeFileId: created.id,
      contentFileId: created.id,
      currentContent: '新正文',
      contentVersion: 1,
      contentEpoch: 2,
    })
  })

  it.each(['create-first', 'switch-first'])('create 与后发 switch 完成顺序为 %s 时仍由 switch 获胜', async (order) => {
    ready([file('one'), file('two')])
    const creating = deferred<{ catalog: FileCatalog, file: MarkdownFile }>()
    const loading = deferred<FileSnapshot>()
    const created = file('00000000-0000-4000-8000-000000000002')
    mocks.createFile.mockReturnValue(creating.promise)
    mocks.readFile.mockReturnValue(loading.promise)
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000002')

    const creation = storeModule.useFilesStore.getState().createFile('新文件', '新正文')
    await vi.waitFor(() => expect(mocks.createFile).toHaveBeenCalledOnce())
    const switching = storeModule.useFilesStore.getState().switchFile('two')

    if (order === 'create-first') {
      creating.resolve({ catalog: catalog(2, [file('one'), file('two'), created]), file: created })
      await creation
      loading.resolve(snapshot('第二篇', 3))
    }
    else {
      loading.resolve(snapshot('第二篇', 3))
      await switching
      creating.resolve({ catalog: catalog(2, [file('one'), file('two'), created]), file: created })
    }
    await Promise.all([creation, switching])

    expect(storeModule.useFilesStore.getState()).toMatchObject({ activeFileId: 'two', contentFileId: 'two', currentContent: '第二篇', contentStatus: 'ready' })
  })

  it('create 在 active loading 期间失败时恢复被作废的 active 加载', async () => {
    ready([file('one'), file('two')])
    const staleLoad = deferred<FileSnapshot>()
    mocks.readFile.mockReturnValueOnce(staleLoad.promise).mockResolvedValueOnce(snapshot('第二篇', 4))
    const switching = storeModule.useFilesStore.getState().switchFile('two')
    await vi.waitFor(() => expect(storeModule.useFilesStore.getState().contentStatus).toBe('loading'))
    mocks.createFile.mockRejectedValue(new mocks.FileStorageError())

    await expect(storeModule.useFilesStore.getState().createFile('失败')).rejects.toBeInstanceOf(mocks.FileStorageError)

    expect(storeModule.useFilesStore.getState()).toMatchObject({ activeFileId: 'two', contentFileId: 'two', currentContent: '第二篇', contentStatus: 'ready' })
    staleLoad.resolve(snapshot('过期正文'))
    await switching
    expect(storeModule.useFilesStore.getState().currentContent).toBe('第二篇')
  })

  it('activate 目标被远端删除后不会停留 loading', async () => {
    ready([file('one'), file('two')])
    const staleLoad = deferred<FileSnapshot>()
    mocks.readFile.mockReturnValueOnce(staleLoad.promise).mockResolvedValueOnce(snapshot('第一篇'))
    const switching = storeModule.useFilesStore.getState().switchFile('two')
    await vi.waitFor(() => expect(mocks.readFile).toHaveBeenCalledWith('two'))
    mocks.getFileCatalog.mockResolvedValue(catalog(2, [file('one')]))
    await storeModule.useFilesStore.getState().syncExternalChanges()
    staleLoad.resolve(snapshot('已删除正文'))
    await switching
    expect(storeModule.useFilesStore.getState()).toMatchObject({ activeFileId: 'one', contentFileId: 'one', currentContent: '第一篇', contentStatus: 'ready' })
  })

  it.each([
    { status: 'idle' as const, contentFileId: null },
    { status: 'ready' as const, contentFileId: 'two' },
  ])('active 相同但内容状态为 $status/$contentFileId 时重新加载', async ({ status, contentFileId }) => {
    ready([file('one'), file('two')])
    storeModule.useFilesStore.setState({ contentStatus: status, contentFileId })
    mocks.readFile.mockResolvedValue(snapshot('重试正文', 5))

    await storeModule.useFilesStore.getState().switchFile('one')

    expect(mocks.readFile).toHaveBeenCalledWith('one')
    expect(storeModule.useFilesStore.getState()).toMatchObject({
      activeFileId: 'one',
      contentFileId: 'one',
      contentStatus: 'ready',
      currentContent: '重试正文',
      contentVersion: 5,
    })
  })

  it('writer 保存版本并通知其他标签', async () => {
    ready()
    mocks.saveFile.mockResolvedValue(6)
    storeModule.useFilesStore.getState().setFileContent('one', '本地正文')
    await storeModule.useFilesStore.getState().flushPendingSaves()
    expect(storeModule.useFilesStore.getState()).toMatchObject({ currentContent: '本地正文', contentVersion: 6, contentEpoch: 1 })
    expect(mocks.notifyFilesChanged).toHaveBeenCalledOnce()
  })

  it('首笔立即写入，短窗口内编辑仅尾随保存最新正文', async () => {
    vi.useFakeTimers()
    ready()
    mocks.saveFile.mockResolvedValue(6)

    storeModule.useFilesStore.getState().setFileContent('one', '首笔')
    expect(mocks.saveFile).toHaveBeenCalledOnce()
    expect(mocks.saveFile).toHaveBeenLastCalledWith('one', '首笔')
    await vi.advanceTimersByTimeAsync(50)
    storeModule.useFilesStore.getState().setFileContent('one', '中间正文')
    await vi.advanceTimersByTimeAsync(50)
    storeModule.useFilesStore.getState().setFileContent('one', '尾随最新')

    await vi.advanceTimersByTimeAsync(50)
    expect(mocks.saveFile).toHaveBeenCalledTimes(2)
    expect(mocks.saveFile).toHaveBeenLastCalledWith('one', '尾随最新')
    expect(mocks.notifyFilesChanged).toHaveBeenCalledTimes(2)

    await vi.advanceTimersByTimeAsync(150)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('flush 立即释放尾随等待并排空最新正文', async () => {
    vi.useFakeTimers()
    ready()
    mocks.saveFile.mockResolvedValue(6)
    storeModule.useFilesStore.getState().setFileContent('one', '首笔')
    await vi.advanceTimersByTimeAsync(0)
    storeModule.useFilesStore.getState().setFileContent('one', '立即落盘')

    await expect(storeModule.useFilesStore.getState().flushPendingSaves()).resolves.toBe(true)

    expect(mocks.saveFile).toHaveBeenCalledTimes(2)
    expect(mocks.saveFile).toHaveBeenLastCalledWith('one', '立即落盘')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('失败草稿不进入尾随等待且 flush 仍可立即重试', async () => {
    vi.useFakeTimers()
    ready()
    mocks.saveFile.mockRejectedValueOnce(new mocks.FileStorageError()).mockResolvedValueOnce(7)
    storeModule.useFilesStore.getState().setFileContent('one', '失败草稿')
    await vi.advanceTimersByTimeAsync(0)
    expect(vi.getTimerCount()).toBe(0)

    await expect(storeModule.useFilesStore.getState().flushPendingSaves()).resolves.toBe(true)

    expect(mocks.saveFile).toHaveBeenCalledTimes(2)
    expect(mocks.saveFile).toHaveBeenLastCalledWith('one', '失败草稿')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('writer 的 FileStorageError 提示保存失败且不伪装版本成功', async () => {
    ready()
    mocks.saveFile.mockRejectedValue(new mocks.FileStorageError())
    storeModule.useFilesStore.getState().setFileContent('one', '未持久化正文')
    await storeModule.useFilesStore.getState().flushPendingSaves()
    expect(storeModule.useFilesStore.getState().contentVersion).toBe(1)
    expect(mocks.notifyFilesChanged).not.toHaveBeenCalled()
    expect(mocks.error).toHaveBeenCalledWith('保存失败，请导出当前内容备份')
  })

  it('同一文件连续保存失败只告警一次，成功后恢复告警', async () => {
    ready()
    mocks.saveFile
      .mockRejectedValueOnce(new mocks.FileStorageError())
      .mockRejectedValueOnce(new mocks.FileStorageError())
      .mockResolvedValueOnce(7)
      .mockRejectedValueOnce(new mocks.FileStorageError())
    storeModule.useFilesStore.getState().setFileContent('one', '草稿甲')
    await vi.waitFor(() => expect(mocks.saveFile).toHaveBeenCalledTimes(1))

    await expect(storeModule.useFilesStore.getState().flushPendingSaves()).resolves.toBe(false)
    expect(mocks.saveFile).toHaveBeenCalledTimes(2)
    expect(mocks.error).toHaveBeenCalledTimes(1)

    await expect(storeModule.useFilesStore.getState().flushPendingSaves()).resolves.toBe(true)
    storeModule.useFilesStore.getState().setFileContent('one', '草稿乙')
    await vi.waitFor(() => expect(mocks.saveFile).toHaveBeenCalledTimes(4))
    expect(mocks.error).toHaveBeenCalledTimes(2)
  })

  it('writer 的非存储异常不提示用户', async () => {
    ready()
    mocks.saveFile.mockRejectedValue(new Error('底层机密错误'))
    storeModule.useFilesStore.getState().setFileContent('one', '未持久化正文')
    await storeModule.useFilesStore.getState().flushPendingSaves()
    expect(storeModule.useFilesStore.getState().contentVersion).toBe(1)
    expect(mocks.error).not.toHaveBeenCalled()
    expect(mocks.notifyFilesChanged).not.toHaveBeenCalled()
  })

  it.each(['switch', 'create', 'delete'])('保存持续失败时 %s 中止且不改变当前会话', async (operation) => {
    ready([file('one'), file('two')])
    mocks.saveFile.mockRejectedValue(new mocks.FileStorageError())
    storeModule.useFilesStore.getState().setFileContent('one', '未保存正文')
    await vi.waitFor(() => expect(mocks.saveFile).toHaveBeenCalledOnce())
    const before = storeModule.useFilesStore.getState()

    if (operation === 'switch') {
      await storeModule.useFilesStore.getState().switchFile('two')
    }
    else if (operation === 'create') {
      await expect(storeModule.useFilesStore.getState().createFile('不会创建')).rejects.toBeInstanceOf(mocks.FileStorageError)
    }
    else {
      await expect(storeModule.useFilesStore.getState().deleteFile('one')).rejects.toBeInstanceOf(mocks.FileStorageError)
    }

    expect(storeModule.useFilesStore.getState()).toMatchObject({
      files: before.files,
      activeFileId: 'one',
      contentFileId: 'one',
      currentContent: '未保存正文',
      contentStatus: 'ready',
      revision: before.revision,
    })
    expect(mocks.saveFile).toHaveBeenCalledTimes(2)
    expect(mocks.createFile).not.toHaveBeenCalled()
    expect(mocks.deleteFile).not.toHaveBeenCalled()
    expect(mocks.readFile).not.toHaveBeenCalled()
    // flush 中止沿用保存告警，不再报操作失败。
    expect(mocks.error).toHaveBeenCalledTimes(1)
    expect(mocks.error).toHaveBeenLastCalledWith('保存失败，请导出当前内容备份')
  })

  it('failed draft 可在下次 flush 重试成功且单次 flush 不会无限重试', async () => {
    ready()
    mocks.saveFile.mockRejectedValueOnce(new mocks.FileStorageError()).mockResolvedValueOnce(7)
    storeModule.useFilesStore.getState().setFileContent('one', '待重试正文')
    await vi.waitFor(() => expect(mocks.saveFile).toHaveBeenCalledOnce())

    await expect(storeModule.useFilesStore.getState().flushPendingSaves()).resolves.toBe(true)

    expect(mocks.saveFile).toHaveBeenCalledTimes(2)
    expect(mocks.saveFile).toHaveBeenLastCalledWith('one', '待重试正文')
    expect(storeModule.useFilesStore.getState().contentVersion).toBe(7)
  })

  it('两个并发 flush 共享一次成功重试', async () => {
    ready()
    const retry = deferred<number | false>()
    mocks.saveFile.mockRejectedValueOnce(new mocks.FileStorageError()).mockReturnValueOnce(retry.promise)
    storeModule.useFilesStore.getState().setFileContent('one', '并发草稿')
    await vi.waitFor(() => expect(mocks.saveFile).toHaveBeenCalledOnce())

    const first = storeModule.useFilesStore.getState().flushPendingSaves()
    const second = storeModule.useFilesStore.getState().flushPendingSaves()
    await vi.waitFor(() => expect(mocks.saveFile).toHaveBeenCalledTimes(2))
    retry.resolve(7)

    await expect(Promise.all([first, second])).resolves.toEqual([true, true])
    expect(mocks.saveFile).toHaveBeenCalledTimes(2)
    expect(storeModule.useFilesStore.getState().contentVersion).toBe(7)
  })

  it('两个并发 flush 共享一次失败重试并保留草稿', async () => {
    ready()
    const retry = deferred<number | false>()
    mocks.saveFile.mockRejectedValueOnce(new mocks.FileStorageError()).mockReturnValueOnce(retry.promise)
    storeModule.useFilesStore.getState().setFileContent('one', '保留草稿')
    await vi.waitFor(() => expect(mocks.saveFile).toHaveBeenCalledOnce())

    const first = storeModule.useFilesStore.getState().flushPendingSaves()
    const second = storeModule.useFilesStore.getState().flushPendingSaves()
    await vi.waitFor(() => expect(mocks.saveFile).toHaveBeenCalledTimes(2))
    retry.reject(new mocks.FileStorageError())

    await expect(Promise.all([first, second])).resolves.toEqual([false, false])
    expect(mocks.saveFile).toHaveBeenCalledTimes(2)
    mocks.saveFile.mockResolvedValueOnce(8)
    await expect(storeModule.useFilesStore.getState().flushPendingSaves()).resolves.toBe(true)
    expect(mocks.saveFile).toHaveBeenLastCalledWith('one', '保留草稿')
  })

  it('新编辑覆盖 failed draft 并保存最新正文', async () => {
    ready()
    mocks.saveFile.mockRejectedValueOnce(new mocks.FileStorageError()).mockResolvedValueOnce(8)
    storeModule.useFilesStore.getState().setFileContent('one', '旧草稿')
    await vi.waitFor(() => expect(mocks.saveFile).toHaveBeenCalledOnce())

    storeModule.useFilesStore.getState().setFileContent('one', '最新草稿')
    await expect(storeModule.useFilesStore.getState().flushPendingSaves()).resolves.toBe(true)

    expect(mocks.saveFile).toHaveBeenLastCalledWith('one', '最新草稿')
    expect(storeModule.useFilesStore.getState()).toMatchObject({ currentContent: '最新草稿', contentVersion: 8 })
  })

  it('权威 catalog 已删除文件时清除草稿且不阻塞切换', async () => {
    ready([file('one'), file('two')])
    mocks.saveFile.mockResolvedValue(false)
    mocks.readFile.mockResolvedValue(snapshot('第二篇'))
    storeModule.useFilesStore.getState().setFileContent('one', '迟到正文')

    await storeModule.useFilesStore.getState().switchFile('two')

    expect(storeModule.useFilesStore.getState()).toMatchObject({ activeFileId: 'two', currentContent: '第二篇' })
    expect(mocks.warning).toHaveBeenCalledWith('该文件已在其他标签页删除')
  })

  it('外部删除活动文件时提示一次并切换，重复同步不再提示', async () => {
    ready([file('one'), file('two')])
    mocks.getFileCatalog.mockResolvedValue(catalog(2, [file('two')]))
    mocks.readFile.mockResolvedValue(snapshot('第二篇'))

    await storeModule.useFilesStore.getState().syncExternalChanges()

    expect(mocks.warning).toHaveBeenCalledWith('该文件已在其他标签页删除')
    expect(storeModule.useFilesStore.getState()).toMatchObject({
      activeFileId: 'two',
      contentFileId: 'two',
      currentContent: '第二篇',
      contentStatus: 'ready',
    })

    mocks.warning.mockClear()
    await storeModule.useFilesStore.getState().syncExternalChanges()
    expect(mocks.warning).not.toHaveBeenCalled()
  })

  it('本标签删除活动文件不提示远端删除', async () => {
    ready([file('one'), file('two')])
    mocks.deleteFile.mockResolvedValue({ catalog: catalog(2, [file('two')]), nextFileId: 'two' })
    mocks.readFile.mockResolvedValue(snapshot('第二篇'))

    await storeModule.useFilesStore.getState().deleteFile('one')

    expect(mocks.warning).not.toHaveBeenCalled()
    expect(storeModule.useFilesStore.getState()).toMatchObject({ activeFileId: 'two', currentContent: '第二篇' })
  })

  it('条件替换仅应用绑定文件的未变化正文', () => {
    ready([file('one'), file('two')])
    const action = storeModule.useFilesStore.getState().replaceFileContentIfUnchanged

    expect(action('one', '旧正文', '格式化正文')).toBe(true)
    expect(storeModule.useFilesStore.getState().currentContent).toBe('格式化正文')
    expect(action('one', '旧正文', '过期结果')).toBe(false)
    storeModule.useFilesStore.setState({ activeFileId: 'two', contentFileId: 'two', currentContent: '第二篇' })
    expect(action('one', '格式化正文', '跨文件结果')).toBe(false)
    expect(storeModule.useFilesStore.getState().currentContent).toBe('第二篇')
  })

  it('external newer content 以最后提交者获胜并增加 contentEpoch', async () => {
    ready()
    mocks.readFile.mockResolvedValue(snapshot('远端正文', 3))
    await storeModule.useFilesStore.getState().syncExternalChanges()
    expect(storeModule.useFilesStore.getState()).toMatchObject({ currentContent: '远端正文', contentVersion: 3, contentEpoch: 2 })
  })

  it('external snapshot 读取期间的本地编辑不被覆盖', async () => {
    ready()
    const remote = deferred<FileSnapshot>()
    mocks.readFile.mockReturnValue(remote.promise)
    const syncing = storeModule.useFilesStore.getState().syncExternalChanges()
    await vi.waitFor(() => expect(mocks.readFile).toHaveBeenCalled())
    storeModule.useFilesStore.getState().setFileContent('one', '本地新正文')
    remote.resolve(snapshot('远端正文', 9))
    await syncing
    await storeModule.useFilesStore.getState().flushPendingSaves()
    expect(storeModule.useFilesStore.getState().currentContent).toBe('本地新正文')
  })

  it('旧编辑器迟到 onChange 的 fileId 被拒绝', () => {
    ready([file('one'), file('two')], 'two')
    storeModule.useFilesStore.getState().setFileContent('one', '迟到正文')
    expect(storeModule.useFilesStore.getState().currentContent).toBe('旧正文')
    expect(mocks.saveFile).not.toHaveBeenCalled()
  })

  it('rename/delete 事务通知其他标签，外部同步不回声', async () => {
    ready([file('one'), file('two')])
    mocks.renameFile.mockResolvedValue(catalog(2, [file('one', '新.md'), file('two')]))
    await storeModule.useFilesStore.getState().renameFile('one', '新')
    mocks.deleteFile.mockResolvedValue({ catalog: catalog(3, [file('one', '新.md')]), nextFileId: 'one' })
    await storeModule.useFilesStore.getState().deleteFile('two')
    expect(mocks.notifyFilesChanged).toHaveBeenCalledTimes(2)
    mocks.notifyFilesChanged.mockClear()
    mocks.getFileCatalog.mockResolvedValue(catalog(4, [file('one', '远端.md')]))
    await storeModule.useFilesStore.getState().syncExternalChanges()
    expect(mocks.notifyFilesChanged).not.toHaveBeenCalled()
  })

  it.each([
    ['create', () => mocks.createFile.mockRejectedValue(new mocks.FileStorageError()), () => storeModule.useFilesStore.getState().createFile('失败')],
    ['delete', () => mocks.deleteFile.mockRejectedValue(new mocks.FileStorageError()), () => storeModule.useFilesStore.getState().deleteFile('one')],
    ['rename', () => mocks.renameFile.mockRejectedValue(new mocks.FileStorageError()), () => storeModule.useFilesStore.getState().renameFile('one', '失败')],
  ])('%s 遇到 FileStorageError 时不产生伪状态', async (_operation, reject, run) => {
    ready()
    reject()
    const before = storeModule.useFilesStore.getState()

    await expect(run()).rejects.toBeInstanceOf(mocks.FileStorageError)

    expect(storeModule.useFilesStore.getState()).toMatchObject({
      files: before.files,
      activeFileId: before.activeFileId,
      contentFileId: before.contentFileId,
      currentContent: before.currentContent,
      contentStatus: before.contentStatus,
      contentVersion: before.contentVersion,
      revision: before.revision,
    })
    expect(mocks.error).toHaveBeenCalledWith('文件操作失败，请重试')
  })

  it('a→b（flush 阻塞）→a 时最新意图获胜', async () => {
    ready([file('one'), file('two')])
    const saving = deferred<number>()
    mocks.saveFile.mockReturnValueOnce(saving.promise)
    storeModule.useFilesStore.getState().setFileContent('one', '未保存正文')
    const switchingB = storeModule.useFilesStore.getState().switchFile('two')
    const switchingA = storeModule.useFilesStore.getState().switchFile('one')
    mocks.readFile.mockResolvedValue(snapshot('第二篇'))

    saving.resolve(2)
    await Promise.all([switchingB, switchingA])

    expect(mocks.readFile).not.toHaveBeenCalledWith('two')
    expect(storeModule.useFilesStore.getState()).toMatchObject({
      activeFileId: 'one',
      contentFileId: 'one',
      currentContent: '未保存正文',
      contentStatus: 'ready',
    })
  })

  it('loading 意图被 create 作废后再次切换会重新发起加载', async () => {
    ready([file('one'), file('two')])
    const firstLoad = deferred<FileSnapshot>()
    const secondLoad = deferred<FileSnapshot>()
    mocks.readFile.mockReturnValueOnce(firstLoad.promise).mockReturnValueOnce(secondLoad.promise)
    const switching = storeModule.useFilesStore.getState().switchFile('two')
    await vi.waitFor(() => expect(mocks.readFile).toHaveBeenCalledTimes(1))
    mocks.createFile.mockImplementation(() => new Promise(() => {}))
    void storeModule.useFilesStore.getState().createFile('打断').catch(() => undefined)

    const reSwitching = storeModule.useFilesStore.getState().switchFile('two')
    await vi.waitFor(() => expect(mocks.readFile).toHaveBeenCalledTimes(2))
    firstLoad.resolve(snapshot('过期正文'))
    secondLoad.resolve(snapshot('第二篇', 4))
    await Promise.all([switching, reSwitching])

    expect(storeModule.useFilesStore.getState()).toMatchObject({
      activeFileId: 'two',
      contentFileId: 'two',
      currentContent: '第二篇',
      contentVersion: 4,
      contentStatus: 'ready',
    })
  })

  it('create 已提交但校准加载失败时仍广播且不拒绝', async () => {
    sessionStorage.setItem('bm.md.files.active', 'session-two')
    ready()
    const created = file('new-id')
    mocks.createFile.mockResolvedValue({ catalog: catalog(2, [file('session-two'), created]), file: created })
    mocks.readFile.mockRejectedValue(new mocks.FileStorageError())

    const id = await storeModule.useFilesStore.getState().createFile('新文件', '新正文')

    expect(id).toBe('new-id')
    expect(mocks.notifyFilesChanged).toHaveBeenCalledOnce()
    expect(mocks.error).toHaveBeenCalledWith('正文加载失败，请重试')
    expect(storeModule.useFilesStore.getState()).toMatchObject({
      activeFileId: 'new-id',
      contentFileId: 'new-id',
      currentContent: '新正文',
      contentStatus: 'ready',
    })
  })

  it('delete 已提交但备选加载失败时不拒绝且可重试', async () => {
    ready([file('one'), file('two')])
    mocks.deleteFile.mockResolvedValue({ catalog: catalog(2, [file('two')]), nextFileId: 'two' })
    mocks.readFile.mockRejectedValue(new mocks.FileStorageError())

    await expect(storeModule.useFilesStore.getState().deleteFile('one')).resolves.toBeUndefined()

    expect(mocks.notifyFilesChanged).toHaveBeenCalledOnce()
    expect(mocks.error).toHaveBeenCalledWith('正文加载失败，请重试')
    expect(storeModule.useFilesStore.getState()).toMatchObject({
      activeFileId: 'two',
      contentFileId: null,
      contentStatus: 'idle',
    })

    mocks.readFile.mockResolvedValue(snapshot('第二篇'))
    await storeModule.useFilesStore.getState().syncExternalChanges()
    expect(storeModule.useFilesStore.getState()).toMatchObject({
      activeFileId: 'two',
      contentFileId: 'two',
      currentContent: '第二篇',
      contentStatus: 'ready',
    })
  })
})
