export interface MarkdownFile {
  id: string
  name: string
  createdAt: number
  updatedAt: number
}

export interface FileCatalog {
  revision: number
  files: MarkdownFile[]
}

export interface NewFile extends MarkdownFile {
  content: string
}

export interface FileSnapshot {
  content: string
  version: number
}

export class FileStorageError extends Error {
  constructor(options?: { cause?: unknown }) {
    super('浏览器存储操作失败，请重试或导出内容', options)
    this.name = 'FileStorageError'
  }
}

// 正文读写抽象，id 即文件名主体（OPFS 下对应 `<id>.md`）。
// read 在正文不存在时必须抛错；remove 约定为尽力而为的清理，不允许抛出：残留孤儿文件无害。
export interface ContentStore {
  read: (id: string) => Promise<string>
  write: (id: string, content: string) => Promise<void>
  remove: (id: string) => Promise<void>
}

export type ContentBackendKind = 'opfs' | 'indexeddb' | 'memory'

// 持久化的 catalog 记录额外携带正文后端标记。
// 目前只有 IndexedDB 降级模式会写入 'indexeddb'：用于跨会话保护，防止
// OPFS 后来变得可用时（如 Safari 升级）把 IDB 里的正文读成空白。
// OPFS 模式不再依赖标记，`catalog.json` 本身就说明数据在 OPFS。
export interface StoredCatalog extends FileCatalog {
  contentBackend?: ContentBackendKind
}

// catalog 与每个文件的正文版本号。
// commitCatalog 的 versions 中值为 undefined 表示删除该文件的版本记录。
export interface MetaStore {
  readCatalog: () => Promise<StoredCatalog>
  readVersion: (id: string) => Promise<number | undefined>
  commitCatalog: (catalog: StoredCatalog, versions: Record<string, number | undefined>) => Promise<void>
}

export interface Backend {
  content: ContentStore
  meta: MetaStore
  persistent: boolean
  contentBackend: ContentBackendKind
}

export function cloneFile(file: MarkdownFile): MarkdownFile {
  return {
    id: file.id,
    name: file.name,
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
  }
}

export function cloneCatalog(catalog: StoredCatalog): StoredCatalog {
  const copy: StoredCatalog = {
    revision: catalog.revision,
    files: catalog.files.map(cloneFile),
  }
  if (catalog.contentBackend !== undefined) {
    copy.contentBackend = catalog.contentBackend
  }
  return copy
}
