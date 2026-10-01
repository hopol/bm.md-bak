import type { DBSchema, IDBPDatabase } from 'idb'
import type { Backend, ContentStore, MetaStore, StoredCatalog } from './types'
import { openDB } from 'idb'
import { cloneCatalog } from './types'

const DB_NAME = 'bm.md'
const DB_VERSION = 2
const CATALOG_KEY = 'main'

interface CatalogRecord extends StoredCatalog {
  key: 'main'
}

interface FileDB extends DBSchema {
  catalog: {
    key: 'main'
    value: CatalogRecord
  }
  files: {
    key: string
    // 正文与版本号分两步写入同一条记录，任一字段都可能暂缺。
    value: { id: string, content?: string, version?: number }
  }
}

let dbPromise: Promise<IDBPDatabase<FileDB>> | null = null

export function getDB(): Promise<IDBPDatabase<FileDB>> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new DOMException('IndexedDB 不可用', 'UnknownError'))
  }
  if (!dbPromise) {
    const opening = openDB<FileDB>(DB_NAME, DB_VERSION, {
      upgrade(database, oldVersion) {
        if (oldVersion < 1) {
          database.createObjectStore('files', { keyPath: 'id' })
        }
        if (oldVersion < 2) {
          database.createObjectStore('catalog', { keyPath: 'key' })
        }
      },
      blocking() {
        // 其他页面要求升级时主动关闭这条连接；缓存仍指向它时清空，让后续操作重连。
        void opening.then(database => database.close()).catch(() => undefined)
        if (dbPromise === opening) {
          dbPromise = null
        }
      },
    })
    dbPromise = opening
  }
  return dbPromise
}

// 跨会话保护标记：catalog 记录里的 contentBackend === 'indexeddb' 表示
// 正文与元数据都在 IndexedDB。只在数据库已存在时才打开，避免 OPFS 会话
// 凭空创建空库；IDB 打不开或读不到时一律视为没有标记。
export async function readIdbBackendMarker(): Promise<'indexeddb' | null> {
  try {
    if (
      typeof indexedDB === 'undefined'
      || (typeof indexedDB.databases === 'function'
        && !(await indexedDB.databases()).some(database => database.name === DB_NAME))
    ) {
      return null
    }
    const database = await getDB()
    const record = await database.get('catalog', CATALOG_KEY)
    if (record?.contentBackend === 'indexeddb') {
      return 'indexeddb'
    }
    // 接下来走 OPFS，不再持有 IndexedDB 连接。
    database.close()
    dbPromise = null
    return null
  }
  catch {
    return null
  }
}

export async function resetIndexedDB(): Promise<void> {
  const opening = dbPromise
  dbPromise = null
  const database = await opening?.catch(() => null)
  database?.close()
  if (typeof indexedDB === 'undefined') {
    return
  }
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new DOMException('数据库删除被阻塞', 'InvalidStateError'))
  })
}

function idbMetaStore(): MetaStore {
  return {
    readCatalog: async () => {
      const record = await (await getDB()).get('catalog', CATALOG_KEY)
      return record ? cloneCatalog(record) : { revision: 0, files: [] }
    },
    readVersion: async (id) => {
      const record = await (await getDB()).get('files', id)
      return record?.version
    },
    commitCatalog: async (catalog, versions) => {
      const transaction = (await getDB()).transaction(['files', 'catalog'], 'readwrite')
      try {
        const filesStore = transaction.objectStore('files')
        for (const [id, version] of Object.entries(versions)) {
          if (version === undefined) {
            await filesStore.delete(id)
          }
          else {
            // 合并已有记录，避免覆盖随正文一起存的 content。
            const existing = await filesStore.get(id)
            await filesStore.put({ ...existing, id, version })
          }
        }
        // IDB 后端每次提交都盖标记：即使先 createFile 后 initialize 也不漏写，
        // 之后 OPFS 可用的会话据此继续走 IndexedDB。
        const record = cloneCatalog(catalog) as CatalogRecord
        record.key = CATALOG_KEY
        record.contentBackend = 'indexeddb'
        await transaction.objectStore('catalog').put(record)
        await transaction.done
      }
      catch (error) {
        try {
          transaction.abort()
        }
        catch {
          // 事务可能已因失败的请求自动中止。
        }
        await transaction.done.catch(() => undefined)
        throw error
      }
    },
  }
}

function idbContentStore(): ContentStore {
  return {
    read: async (id) => {
      const record = await (await getDB()).get('files', id)
      if (record?.content === undefined) {
        throw new DOMException(`正文缺失：${id}`, 'NotFoundError')
      }
      return record.content
    },
    write: async (id, content) => {
      // 保留已写入的 version，正文与版本号各自更新。
      const database = await getDB()
      const record = await database.get('files', id)
      await database.put('files', { ...record, id, content })
    },
    remove: async (id) => {
      try {
        await (await getDB()).delete('files', id)
      }
      catch {
        // 孤儿记录无害，删除失败可忽略。
      }
    },
  }
}

// IndexedDB 后端：catalog 与 version 存 catalog/files 两个 store，正文随 files 记录。
export function idbBackend(): Backend {
  return {
    persistent: true,
    contentBackend: 'indexeddb',
    meta: idbMetaStore(),
    content: idbContentStore(),
  }
}
