import type { NewFile } from '@/lib/file-storage'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import 'fake-indexeddb/auto'

type StorageModule = typeof import('@/lib/file-storage')

const storageModules: StorageModule[] = []

function file(id: string, name = `${id}.md`, content = id): NewFile {
  return { id, name, content, createdAt: 1, updatedAt: 1 }
}

async function loadStorage(): Promise<StorageModule> {
  const storage = await import('@/lib/file-storage')
  storageModules.push(storage)
  return storage
}

// 串行化的 Web Locks mock：后续任务排在前一个任务之后执行。
function mockLocks() {
  let tail = Promise.resolve<unknown>(undefined)
  const request = vi.fn(async (
    _name: string,
    optionsOrTask: { mode?: string } | (() => unknown),
    maybeTask?: () => unknown,
  ) => {
    const task = (typeof optionsOrTask === 'function' ? optionsOrTask : maybeTask)!
    const result = tail.then(task)
    tail = result.catch(() => undefined)
    return result
  })
  return { request }
}

function stubNavigator(extra: Record<string, unknown> = {}) {
  const locks = mockLocks()
  vi.stubGlobal('navigator', { locks, storage: undefined, ...extra })
  return locks
}

function installOpfs() {
  const files = new Map<string, string>()
  const root = {
    getFileHandle: vi.fn(async (name: string, options?: { create?: boolean }) => {
      if (!files.has(name)) {
        if (!options?.create) {
          throw new DOMException(`未找到 ${name}`, 'NotFoundError')
        }
        files.set(name, '')
      }
      return {
        getFile: async () => ({ text: async () => files.get(name)! }),
        createWritable: async () => ({
          write: async (data: unknown) => {
            if (typeof data !== 'string') {
              throw new TypeError('仅支持字符串正文')
            }
            files.set(name, data)
          },
          close: async () => undefined,
          abort: async () => undefined,
        }),
      }
    }),
    removeEntry: vi.fn(async (name: string) => {
      files.delete(name)
    }),
    keys: () => files.keys(),
  }
  const storage = { getDirectory: vi.fn(async () => root) }
  const locks = stubNavigator({ storage })
  vi.stubGlobal('FileSystemFileHandle', {
    prototype: { createWritable: () => Promise.resolve(null) },
  })
  return { files, locks, root, storage }
}

function opfsCatalog(files: Map<string, string>): { revision: number, files: unknown[], versions: Record<string, number> } {
  return JSON.parse(files.get('catalog.json')!)
}

async function openNativeDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('bm.md')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function readIdbFileRecord(id: string): Promise<unknown> {
  const database = await openNativeDatabase()
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction('files', 'readonly')
      const request = transaction.objectStore('files').get(id)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }
  finally {
    database.close()
  }
}

async function readIdbCatalogRecord(): Promise<Record<string, unknown> | undefined> {
  const database = await openNativeDatabase()
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction('catalog', 'readonly')
      const request = transaction.objectStore('catalog').get('main')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }
  finally {
    database.close()
  }
}

function deleteNativeDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase('bm.md')
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('数据库删除被阻塞'))
  })
}

async function initialize(storage: StorageModule, defaultFile = file('default')) {
  return storage.initializeFileStorage(defaultFile)
}

beforeEach(async () => {
  vi.resetModules()
  stubNavigator()
  await deleteNativeDatabase()
})

afterEach(async () => {
  await Promise.allSettled(storageModules.splice(0).map(storage => storage.__resetFileStorage()))
  vi.unstubAllGlobals()
  vi.resetModules()
  await deleteNativeDatabase()
})

describe('file-storage（IndexedDB 后端）', () => {
  it('首次初始化写入默认文件并标记 contentBackend=indexeddb，重复初始化直接返回已有 catalog', async () => {
    const storage = await loadStorage()

    await expect(initialize(storage, file('default', '默认文档.md', '默认正文'))).resolves.toEqual({
      persistent: true,
      catalog: { revision: 1, files: [{ id: 'default', name: '默认文档.md', createdAt: 1, updatedAt: 1 }] },
    })
    await expect(initialize(storage, file('other'))).resolves.toMatchObject({
      persistent: true,
      catalog: { revision: 1 },
    })
    await expect(storage.readFile('default')).resolves.toEqual({ content: '默认正文', version: 1 })
    await expect(readIdbCatalogRecord()).resolves.toMatchObject({ contentBackend: 'indexeddb' })
  })

  it('crud 完整行为：名称规范化去重、rename 更新 updatedAt、save 递增 version、delete 清理正文', async () => {
    const storage = await loadStorage()
    await initialize(storage, file('default', 'Note.MD', '正文'))

    const created = await storage.createFile(file('next', 'note.md', '新正文'))
    expect(created.file.name).toBe('note (1).md')
    expect(created.catalog.revision).toBe(2)
    await expect(storage.readFile('next')).resolves.toEqual({ content: '新正文', version: 1 })

    const renamed = await storage.renameFile('next', '又一文档')
    expect(renamed.files.find(item => item.id === 'next')?.name).toBe('又一文档.md')
    expect(renamed.files.find(item => item.id === 'next')?.updatedAt).toBeGreaterThan(1)

    await expect(storage.saveFile('next', '第二版')).resolves.toBe(2)
    await expect(storage.saveFile('next', '第三版')).resolves.toBe(3)
    await expect(storage.readFile('next')).resolves.toEqual({ content: '第三版', version: 3 })

    const deleted = await storage.deleteFile('next', file('replacement'))
    expect(deleted.nextFileId).toBe('default')
    expect(deleted.catalog.files.some(item => item.id === 'next')).toBe(false)
    await expect(storage.readFile('next')).resolves.toEqual({ content: '', version: 0 })
    await expect(readIdbFileRecord('next')).resolves.toBeUndefined()
  })

  it('rename 与 delete 不存在的 id 时原样返回 catalog / nextFileId 为 null', async () => {
    const storage = await loadStorage()
    await initialize(storage)

    await expect(storage.renameFile('missing', '名字')).resolves.toEqual({ revision: 1, files: expect.any(Array) })
    await expect(storage.deleteFile('missing', file('replacement'))).resolves.toEqual({
      catalog: { revision: 1, files: [{ id: 'default', name: 'default.md', createdAt: 1, updatedAt: 1 }] },
      nextFileId: null,
    })
    await expect(storage.saveFile('missing', '正文')).resolves.toBe(false)
  })

  it('删除最后一个文件时插入 replacement 并指向它', async () => {
    const storage = await loadStorage()
    await initialize(storage)

    const result = await storage.deleteFile('default', file('replacement', '替代', '替代正文'))

    expect(result.nextFileId).toBe('replacement')
    expect(result.catalog.files).toEqual([{ id: 'replacement', name: '替代.md', createdAt: 1, updatedAt: 1 }])
    await expect(storage.readFile('replacement')).resolves.toEqual({ content: '替代正文', version: 1 })
  })

  it('create 在元数据提交失败时不残留正文', async () => {
    const storage = await loadStorage()
    await initialize(storage)
    const originalPut = IDBObjectStore.prototype.put
    const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value, key) {
      if (this.name === 'catalog') {
        throw new DOMException('CATALOG_PUT_FAILED', 'DataError')
      }
      return key === undefined ? originalPut.call(this, value) : originalPut.call(this, value, key)
    })

    await expect(storage.createFile(file('broken', '损坏.md', '正文'))).rejects.toBeInstanceOf(storage.FileStorageError)
    put.mockRestore()

    await expect(readIdbFileRecord('broken')).resolves.toBeUndefined()
    expect((await storage.getFileCatalog()).files.some(item => item.id === 'broken')).toBe(false)
  })

  it('运行期 IndexedDB 失败统一抛 FileStorageError 且保留 cause', async () => {
    const storage = await loadStorage()
    await initialize(storage)
    const get = vi.spyOn(IDBObjectStore.prototype, 'get').mockImplementation(() => {
      throw new DOMException('GET_FAILED', 'InvalidStateError')
    })

    const failure = storage.getFileCatalog()
    await expect(failure).rejects.toBeInstanceOf(storage.FileStorageError)
    await failure.catch(error => expect((error as Error).cause).toBeInstanceOf(DOMException))

    get.mockRestore()
    await expect(storage.getFileCatalog()).resolves.toMatchObject({ revision: 1 })
  })

  it('并发写经 Web Locks 串行执行，version 严格递增', async () => {
    const locks = stubNavigator()
    const storage = await loadStorage()
    await initialize(storage)

    const [first, second] = await Promise.all([
      storage.saveFile('default', '连接一'),
      storage.saveFile('default', '连接二'),
    ])

    expect([first, second].sort()).toEqual([2, 3])
    expect(locks.request).toHaveBeenCalled()
    await expect(storage.readFile('default')).resolves.toMatchObject({ version: 3 })
  })

  it('读操作申请 shared 锁，写操作申请 exclusive 锁', async () => {
    const locks = stubNavigator()
    const storage = await loadStorage()
    await initialize(storage)
    locks.request.mockClear()

    await storage.readFile('default')
    await storage.getFileCatalog()
    await storage.saveFile('default', '正文')

    const modes = locks.request.mock.calls.map(call =>
      typeof call[1] === 'function' ? undefined : call[1]?.mode)
    expect(modes).toEqual(['shared', 'shared', 'exclusive'])
  })

  it('blocking 触发关闭后，后续操作自动重连', async () => {
    const storage = await loadStorage()
    await initialize(storage, file('default', '默认文档.md', '默认正文'))

    // deleteDatabase 会向已打开的连接派发 versionchange，模拟 blocking 场景。
    await deleteNativeDatabase()

    await initialize(storage, file('fresh', '新文档.md', '新正文'))
    await expect(storage.saveFile('fresh', '第二版')).resolves.toBe(2)
    await expect(storage.readFile('fresh')).resolves.toEqual({ content: '第二版', version: 2 })
  })

  it('catalog 记录 indexeddb 后，OPFS 可用的会话仍走 IndexedDB', async () => {
    const storage = await loadStorage()
    await initialize(storage, file('default', '默认文档.md', '默认正文'))

    vi.resetModules()
    const opfs = installOpfs()
    const next = await loadStorage()

    await expect(next.getFileCatalog()).resolves.toMatchObject({ revision: 1 })
    await expect(next.readFile('default')).resolves.toEqual({ content: '默认正文', version: 1 })
    expect(opfs.files.size).toBe(0)
    await expect(next.saveFile('default', '更新')).resolves.toBe(2)
    await expect(readIdbFileRecord('default')).resolves.toMatchObject({ content: '更新', version: 2 })
  })

  it('不经过 initialize 直接 createFile 也会盖上标记，下个 OPFS 会话仍走 IndexedDB', async () => {
    const storage = await loadStorage()
    await storage.createFile(file('early', '先建.md', '正文'))
    await expect(readIdbCatalogRecord()).resolves.toMatchObject({ contentBackend: 'indexeddb' })

    vi.resetModules()
    const opfs = installOpfs()
    const next = await loadStorage()

    await expect(next.readFile('early')).resolves.toEqual({ content: '正文', version: 1 })
    expect(opfs.files.size).toBe(0)
  })

  it('catalog 中有记录但正文缺失时 readFile 抛 FileStorageError', async () => {
    const storage = await loadStorage()
    await initialize(storage, file('default', '默认文档.md', '默认正文'))

    const database = await openNativeDatabase()
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('files', 'readwrite')
      transaction.objectStore('files').delete('default')
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
    })
    database.close()

    await expect(storage.readFile('default')).rejects.toBeInstanceOf(storage.FileStorageError)
    await expect(storage.readFile('not-exist')).resolves.toEqual({ content: '', version: 0 })
  })
})

describe('file-storage（OPFS 后端）', () => {
  it('元数据与正文都在 OPFS，不打开 IndexedDB', async () => {
    const opfs = installOpfs()
    const open = vi.spyOn(indexedDB, 'open')
    const storage = await loadStorage()

    await initialize(storage, file('default', '默认文档.md', '默认正文'))

    expect(opfs.files.get('default.md')).toBe('默认正文')
    expect(opfsCatalog(opfs.files)).toEqual({
      revision: 1,
      files: [{ id: 'default', name: '默认文档.md', createdAt: 1, updatedAt: 1 }],
      versions: { default: 1 },
    })
    expect(open).not.toHaveBeenCalled()
    await expect(storage.readFile('default')).resolves.toEqual({ content: '默认正文', version: 1 })
  })

  it('catalog.json 已存在时复用 OPFS 数据且不打开 IndexedDB', async () => {
    const opfs = installOpfs()
    const first = await loadStorage()
    await initialize(first, file('default', '默认文档.md', '默认正文'))

    vi.resetModules()
    installOpfsSameFiles(opfs)
    const open = vi.spyOn(indexedDB, 'open')
    const second = await loadStorage()

    await expect(second.getFileCatalog()).resolves.toMatchObject({ revision: 1 })
    await expect(second.readFile('default')).resolves.toEqual({ content: '默认正文', version: 1 })
    expect(open).not.toHaveBeenCalled()
  })

  it('save 更新 catalog.json 中的 version 而不改 revision', async () => {
    const opfs = installOpfs()
    const storage = await loadStorage()
    await initialize(storage)

    await expect(storage.saveFile('default', '第二版')).resolves.toBe(2)

    expect(opfs.files.get('default.md')).toBe('第二版')
    expect(opfsCatalog(opfs.files)).toMatchObject({ revision: 1, versions: { default: 2 } })
  })

  it('crud 行为与 IndexedDB 后端一致', async () => {
    const opfs = installOpfs()
    const storage = await loadStorage()
    await initialize(storage, file('default', 'Note.MD'))

    const created = await storage.createFile(file('next', 'note.md', '新正文'))
    expect(created.file.name).toBe('note (1).md')
    expect(opfs.files.get('next.md')).toBe('新正文')

    const renamed = await storage.renameFile('next', '又一文档')
    expect(renamed.files.find(item => item.id === 'next')?.name).toBe('又一文档.md')

    const deleted = await storage.deleteFile('next', file('replacement'))
    expect(deleted.nextFileId).toBe('default')
    expect(opfs.files.has('next.md')).toBe(false)
    expect(opfsCatalog(opfs.files).versions.next).toBeUndefined()
    await expect(storage.readFile('next')).resolves.toEqual({ content: '', version: 0 })
  })

  it('create 在元数据提交失败时不残留 OPFS 文件', async () => {
    const opfs = installOpfs()
    const storage = await loadStorage()
    await initialize(storage)
    // 只让 catalog.json 的写入（create:true）失败，正常读取不受影响。
    let failCatalogWrite = false
    const original = opfs.root.getFileHandle.getMockImplementation()!
    opfs.root.getFileHandle.mockImplementation(async (name: string, options?: { create?: boolean }) => {
      if (failCatalogWrite && name === 'catalog.json' && options?.create) {
        throw new DOMException('写不进', 'QuotaExceededError')
      }
      return original(name, options)
    })
    failCatalogWrite = true

    await expect(storage.createFile(file('broken', '损坏.md', '正文'))).rejects.toBeInstanceOf(storage.FileStorageError)
    failCatalogWrite = false

    expect(opfs.files.has('broken.md')).toBe(false)
    expect((opfsCatalog(opfs.files).files as { id: string }[]).some(item => item.id === 'broken')).toBe(false)
    expect(opfsCatalog(opfs.files).versions.broken).toBeUndefined()
  })

  it('写入 OPFS 失败抛 FileStorageError 且不递增版本', async () => {
    const opfs = installOpfs()
    const storage = await loadStorage()
    await initialize(storage)
    opfs.root.getFileHandle.mockRejectedValueOnce(new DOMException('QUOTA', 'QuotaExceededError'))

    await expect(storage.saveFile('default', '写不进')).rejects.toBeInstanceOf(storage.FileStorageError)

    await expect(storage.readFile('default')).resolves.toEqual({ content: 'default', version: 1 })
  })

  it('并发写经 Web Locks 串行执行', async () => {
    const opfs = installOpfs()
    const storage = await loadStorage()
    await initialize(storage)
    opfs.locks.request.mockClear()

    const [first, second] = await Promise.all([
      storage.saveFile('default', '连接一'),
      storage.saveFile('default', '连接二'),
    ])

    expect([first, second].sort()).toEqual([2, 3])
    expect(opfs.locks.request).toHaveBeenCalledTimes(2)
    await expect(storage.readFile('default')).resolves.toMatchObject({ version: 3 })
  })

  it('catalog 中有记录但 OPFS 正文缺失时 readFile 抛 FileStorageError', async () => {
    const opfs = installOpfs()
    const storage = await loadStorage()
    await initialize(storage, file('default', '默认文档.md', '默认正文'))

    opfs.files.delete('default.md')

    await expect(storage.readFile('default')).rejects.toBeInstanceOf(storage.FileStorageError)
    await expect(storage.readFile('not-exist')).resolves.toEqual({ content: '', version: 0 })
  })

  it('catalog.json 探测失败抛 FileStorageError 且可重试', async () => {
    const opfs = installOpfs()
    opfs.root.getFileHandle.mockRejectedValueOnce(new DOMException('DENIED', 'SecurityError'))
    const storage = await loadStorage()

    await expect(storage.getFileCatalog()).rejects.toBeInstanceOf(storage.FileStorageError)

    await initialize(storage, file('default', '默认文档.md', '默认正文'))
    expect(opfs.files.get('default.md')).toBe('默认正文')
  })

  it('getDirectory 失败时走 IndexedDB 后端并写入标记', async () => {
    const opfs = installOpfs()
    opfs.storage.getDirectory.mockRejectedValue(new DOMException('DENIED', 'SecurityError'))
    const storage = await loadStorage()

    await expect(initialize(storage, file('default', '默认文档.md', '默认正文'))).resolves.toMatchObject({ persistent: true })

    expect(opfs.files.size).toBe(0)
    await expect(readIdbFileRecord('default')).resolves.toMatchObject({ content: '默认正文', version: 1 })
    await expect(readIdbCatalogRecord()).resolves.toMatchObject({ contentBackend: 'indexeddb' })

    await storage.createFile(file('created', '新文档', '创建正文'))
    await expect(storage.saveFile('created', '更新正文')).resolves.toBe(2)
    await storage.deleteFile('created', file('replacement'))

    expect(opfs.files.size).toBe(0)
    await expect(readIdbFileRecord('created')).resolves.toBeUndefined()
    await expect(storage.readFile('created')).resolves.toEqual({ content: '', version: 0 })
  })

  it('opfs 会话不需要 indexedDB（无 indexedDB 也可工作）', async () => {
    installOpfs()
    vi.stubGlobal('indexedDB', undefined)
    const storage = await loadStorage()

    await initialize(storage, file('default', '默认文档.md', '默认正文'))
    await expect(storage.readFile('default')).resolves.toEqual({ content: '默认正文', version: 1 })
    await expect(storage.saveFile('default', '更新')).resolves.toBe(2)
  })

  it('reset 清空 OPFS 中的 .md 文件与 catalog.json 并重置后端选择', async () => {
    const opfs = installOpfs()
    const storage = await loadStorage()
    await initialize(storage)
    opfs.files.set('other.md', '无关内容')

    await storage.__resetFileStorage()

    expect(opfs.files.size).toBe(0)
    await expect(storage.getFileCatalog()).resolves.toEqual({ revision: 0, files: [] })
    await expect(storage.initializeFileStorage(file('fresh', '新文档', '新正文'))).resolves.toMatchObject({
      persistent: true,
      catalog: { revision: 1 },
    })
  })
})

// 复用同一批 OPFS 文件重新挂 global mock（模拟同设备上的另一个会话）。
function installOpfsSameFiles(previous: ReturnType<typeof installOpfs>) {
  vi.stubGlobal('navigator', { locks: mockLocks(), storage: previous.storage })
  vi.stubGlobal('FileSystemFileHandle', {
    prototype: { createWritable: () => Promise.resolve(null) },
  })
}

describe('file-storage（内存后端）', () => {
  it('indexedDB 不可用时走内存且 persistent=false，crud 仍可用', async () => {
    vi.stubGlobal('indexedDB', undefined)
    const storage = await loadStorage()

    await expect(initialize(storage, file('default', '默认文档.md', '默认正文'))).resolves.toMatchObject({
      persistent: false,
      catalog: { revision: 1 },
    })

    const created = await storage.createFile(file('memory', '内存', '正文'))
    expect(created.file.name).toBe('内存.md')
    await storage.renameFile('memory', '重命名')
    await expect(storage.saveFile('memory', '内存正文')).resolves.toBe(2)
    await expect(storage.readFile('memory')).resolves.toEqual({ content: '内存正文', version: 2 })
    const deleted = await storage.deleteFile('memory', file('replacement'))
    expect(deleted.catalog.files.some(item => item.id === 'memory')).toBe(false)
  })

  it('indexedDB 打开失败时同样回落内存且不会重试', async () => {
    const open = vi.fn(() => {
      throw new DOMException('OPEN_FAILED', 'UnknownError')
    })
    vi.stubGlobal('indexedDB', { open, deleteDatabase: indexedDB.deleteDatabase.bind(indexedDB) })
    const storage = await loadStorage()

    await expect(initialize(storage)).resolves.toMatchObject({ persistent: false })
    await expect(storage.createFile(file('memory', '内存', '正文'))).resolves.toMatchObject({
      file: { id: 'memory', name: '内存.md' },
    })
    await expect(storage.readFile('memory')).resolves.toEqual({ content: '正文', version: 1 })
    expect(open).toHaveBeenCalledTimes(1)
  })
})
