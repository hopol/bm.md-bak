import type { Backend, ContentStore, MetaStore, StoredCatalog } from './types'
import { cloneCatalog } from './types'

const CATALOG_FILE = 'catalog.json'

interface CatalogFile {
  revision: number
  files: StoredCatalog['files']
  versions: Record<string, number>
}

let probePromise: Promise<FileSystemDirectoryHandle | null> | null = null

// OPFS 能力一次性探测：API 存在且 getDirectory 调用成功才启用（隐私模式等
// 环境中 getDirectory 会 reject）。结果整个会话内固定，失败不算存储不可用。
export function probeOpfsRoot(): Promise<FileSystemDirectoryHandle | null> {
  probePromise ??= (async () => {
    try {
      if (
        typeof navigator === 'undefined'
        || typeof navigator.storage?.getDirectory !== 'function'
        || typeof FileSystemFileHandle === 'undefined'
        || typeof FileSystemFileHandle.prototype.createWritable !== 'function'
      ) {
        return null
      }
      return await navigator.storage.getDirectory()
    }
    catch {
      return null
    }
  })()
  return probePromise
}

// OPFS 中是否存在 catalog.json。只有 NotFoundError 视为不存在；
// 其他错误（损坏、权限等）向上抛出，调用方据此转成 FileStorageError 并可重试。
// 出现即说明数据在 OPFS；反向场景（数据在 OPFS 但 OPFS 变得不可用）无法在
// 不访问 OPFS 的前提下探测，此时会退回 IndexedDB，catalog 读出来为空——
// 这是已知且可接受的限制。
export async function hasOpfsCatalog(root: FileSystemDirectoryHandle): Promise<boolean> {
  try {
    await root.getFileHandle(CATALOG_FILE)
    return true
  }
  catch (error) {
    if (error instanceof Error && error.name === 'NotFoundError') {
      return false
    }
    throw error
  }
}

async function readCatalogFile(root: FileSystemDirectoryHandle): Promise<CatalogFile> {
  try {
    const handle = await root.getFileHandle(CATALOG_FILE)
    return JSON.parse(await (await handle.getFile()).text())
  }
  catch (error) {
    if (error instanceof Error && error.name === 'NotFoundError') {
      return { revision: 0, files: [], versions: {} }
    }
    // JSON 损坏等情况按错误抛出，避免误当成空 catalog 覆盖已有数据。
    throw error
  }
}

async function writeCatalogFile(root: FileSystemDirectoryHandle, catalog: CatalogFile): Promise<void> {
  const handle = await root.getFileHandle(CATALOG_FILE, { create: true })
  const writable = await handle.createWritable()
  try {
    await writable.write(JSON.stringify(catalog))
    await writable.close()
  }
  catch (error) {
    await writable.abort().catch(() => undefined)
    throw error
  }
}

function opfsMetaStore(root: FileSystemDirectoryHandle): MetaStore {
  return {
    readCatalog: async () => {
      const file = await readCatalogFile(root)
      return cloneCatalog({ revision: file.revision, files: file.files })
    },
    readVersion: async id => (await readCatalogFile(root)).versions[id],
    // 重新读取整份 catalog.json 再合并写回；调用方已持有写锁，读-改-写不会被插队。
    commitCatalog: async (catalog, versions) => {
      const file = await readCatalogFile(root)
      for (const [id, version] of Object.entries(versions)) {
        if (version === undefined) {
          delete file.versions[id]
        }
        else {
          file.versions[id] = version
        }
      }
      await writeCatalogFile(root, { revision: catalog.revision, files: catalog.files, versions: file.versions })
    },
  }
}

function opfsContentStore(root: FileSystemDirectoryHandle): ContentStore {
  return {
    read: async (id) => {
      // 正文缺失时 NotFoundError 直接向上抛，由调用方转成 FileStorageError。
      const handle = await root.getFileHandle(`${id}.md`)
      return await (await handle.getFile()).text()
    },
    write: async (id, content) => {
      const handle = await root.getFileHandle(`${id}.md`, { create: true })
      const writable = await handle.createWritable()
      try {
        await writable.write(content)
        await writable.close()
      }
      catch (error) {
        await writable.abort().catch(() => undefined)
        throw error
      }
    },
    remove: async (id) => {
      try {
        await root.removeEntry(`${id}.md`)
      }
      catch {
        // 孤儿文件无害，删除失败可忽略。
      }
    },
  }
}

// OPFS 后端：元数据在根目录 catalog.json（{ revision, files, versions }），
// 正文在 `<id>.md`，整个会话不打开 IndexedDB。
export function opfsBackend(root: FileSystemDirectoryHandle): Backend {
  return {
    persistent: true,
    contentBackend: 'opfs',
    meta: opfsMetaStore(root),
    content: opfsContentStore(root),
  }
}

// 测试与调试专用：清空 OPFS 根目录下的 .md 文件与 catalog.json，并重置探测结果。
export async function resetOpfs(): Promise<void> {
  const root = await probeOpfsRoot()
  if (root) {
    const names: string[] = []
    for await (const name of root.keys()) {
      if (name.endsWith('.md') || name === CATALOG_FILE) {
        names.push(name)
      }
    }
    for (const name of names) {
      await root.removeEntry(name)
    }
  }
  probePromise = null
}
