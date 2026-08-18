import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import 'fake-indexeddb/auto'

type FilesStore = typeof import('./files')['useFilesStore']
type StorageModule = typeof import('@/lib/file-storage')

interface Tab {
  store: FilesStore
  storage: StorageModule
  session: Storage
}

const tabs: Tab[] = []

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: key => values.get(key) ?? null,
    key: index => [...values.keys()][index] ?? null,
    removeItem: key => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  }
}

function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase('bm.md')
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('测试数据库删除被阻塞'))
  })
}

async function loadTab(session: Storage): Promise<Tab> {
  vi.resetModules()
  vi.stubGlobal('sessionStorage', session)
  const files = await import('./files')
  const storage = await import('@/lib/file-storage')
  const tab = { store: files.useFilesStore, storage, session }
  tabs.push(tab)
  return tab
}

function expectTerminalInvariant(tab: Tab): void {
  const state = tab.store.getState()
  expect(state.isInitialized).toBe(true)
  if (state.contentStatus === 'idle') {
    expect(state.contentFileId).toBeNull()
    expect(state.currentContent).toBe('')
    return
  }
  expect(['ready', 'loading']).toContain(state.contentStatus)
  expect(state.activeFileId).not.toBeNull()
  expect(state.contentFileId).toBe(state.activeFileId)
  expect(state.files.some(file => file.id === state.activeFileId)).toBe(true)
}

async function syncBoth(first: Tab, second: Tab): Promise<void> {
  await Promise.all([
    first.store.getState().syncExternalChanges(),
    second.store.getState().syncExternalChanges(),
  ])
}

beforeEach(async () => {
  Object.defineProperty(globalThis, 'window', { value: {}, configurable: true })
  vi.stubGlobal('localStorage', memoryStorage())
  await deleteDatabase()
})

afterEach(async () => {
  await Promise.all(tabs.map(tab => tab.store.getState().flushPendingSaves()))
  await Promise.all(tabs.splice(0).map(tab => tab.storage.__closeFileStorage()))
  vi.resetModules()
  await deleteDatabase()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(globalThis, 'window')
})

describe('files 双标签集成', () => {
  it('真实双连接在并发元数据与正文操作后收敛且保持标签活动态', async () => {
    const first = await loadTab(memoryStorage())
    const second = await loadTab(memoryStorage())

    await Promise.all([
      first.store.getState().initialize(),
      second.store.getState().initialize(),
    ])

    const initialFirst = first.store.getState()
    const initialSecond = second.store.getState()
    expect(initialFirst.revision).toBe(1)
    expect(initialFirst.files).toHaveLength(1)
    expect(initialSecond.files).toEqual(initialFirst.files)
    expectTerminalInvariant(first)
    expectTerminalInvariant(second)

    const [firstCreatedId, secondCreatedId] = await Promise.all([
      first.store.getState().createFile('同名', '甲正文'),
      second.store.getState().createFile('同名', '乙正文'),
    ])
    await syncBoth(first, second)

    for (const tab of [first, second]) {
      const files = tab.store.getState().files
      expect(files.map(file => file.id)).toEqual(expect.arrayContaining([firstCreatedId, secondCreatedId]))
      const createdNames = files
        .filter(file => file.id === firstCreatedId || file.id === secondCreatedId)
        .map(file => file.name.toLocaleLowerCase())
      expect(new Set(createdNames).size).toBe(2)
      expectTerminalInvariant(tab)
    }

    await first.store.getState().switchFile(firstCreatedId)
    await second.store.getState().switchFile(secondCreatedId)
    expect(first.session.getItem('bm.md.files.active')).toBe(firstCreatedId)
    expect(second.session.getItem('bm.md.files.active')).toBe(secondCreatedId)
    await first.store.getState().renameFile(firstCreatedId, '甲重命名')
    await second.store.getState().syncExternalChanges()
    expect(first.store.getState().activeFileId).toBe(firstCreatedId)
    expect(second.store.getState().activeFileId).toBe(secondCreatedId)

    await second.store.getState().switchFile(firstCreatedId)
    first.store.getState().setFileContent(firstCreatedId, '甲最后写入')
    await first.store.getState().flushPendingSaves()
    await second.store.getState().syncExternalChanges()
    expect(second.store.getState().currentContent).toBe('甲最后写入')

    second.store.getState().setFileContent(firstCreatedId, '乙最后写入')
    await second.store.getState().flushPendingSaves()
    await first.store.getState().syncExternalChanges()
    expect(first.store.getState().currentContent).toBe('乙最后写入')
    expect(first.store.getState().contentVersion).toBe(second.store.getState().contentVersion)

    await first.store.getState().switchFile(secondCreatedId)
    await first.store.getState().deleteFile(firstCreatedId)
    await second.store.getState().syncExternalChanges()
    const secondAfterDelete = second.store.getState()
    expect(secondAfterDelete.activeFileId).not.toBe(firstCreatedId)
    expect(secondAfterDelete.files.some(file => file.id === secondAfterDelete.activeFileId)).toBe(true)
    expectTerminalInvariant(second)

    const creating = second.store.getState().createFile('交错创建', '交错正文')
    const noOpSync = second.store.getState().syncExternalChanges()
    const [lastCreatedId] = await Promise.all([creating, noOpSync])
    expect(second.store.getState()).toMatchObject({
      activeFileId: lastCreatedId,
      contentFileId: lastCreatedId,
      currentContent: '交错正文',
      contentStatus: 'ready',
    })

    await syncBoth(first, second)
    expectTerminalInvariant(first)
    expectTerminalInvariant(second)
  })

  it('rename/delete 两种提交顺序都不会复活删除项', async () => {
    const first = await loadTab(memoryStorage())
    const second = await loadTab(memoryStorage())
    await Promise.all([first.store.getState().initialize(), second.store.getState().initialize()])

    const renameFirstId = await first.store.getState().createFile('先改名')
    await second.store.getState().syncExternalChanges()
    await first.store.getState().renameFile(renameFirstId, '已改名')
    await second.store.getState().deleteFile(renameFirstId)
    await syncBoth(first, second)
    expect(first.store.getState().files.some(file => file.id === renameFirstId)).toBe(false)
    expect(second.store.getState().files.some(file => file.id === renameFirstId)).toBe(false)

    const deleteFirstId = await first.store.getState().createFile('先删除')
    await second.store.getState().syncExternalChanges()
    await first.store.getState().deleteFile(deleteFirstId)
    await second.store.getState().renameFile(deleteFirstId, '迟到改名')
    await syncBoth(first, second)
    expect(first.store.getState().files.some(file => file.id === deleteFirstId)).toBe(false)
    expect(second.store.getState().files.some(file => file.id === deleteFirstId)).toBe(false)
    expectTerminalInvariant(first)
    expectTerminalInvariant(second)
  })
})
