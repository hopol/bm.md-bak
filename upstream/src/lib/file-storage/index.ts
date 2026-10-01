import type { Backend, FileCatalog, FileSnapshot, MarkdownFile, NewFile, StoredCatalog } from './types'
import { getBackend, resetBackend } from './backend'
import { uniqueFileName } from './file-name'
import { cloneFile, FileStorageError } from './types'

export type { FileCatalog, FileSnapshot, MarkdownFile, NewFile } from './types'
export { FileStorageError } from './types'

const LOCK_NAME = 'bm.md.files'

// catalog 记录内部携带正文后端标记，公开 API 不暴露该字段。
function publicCatalog(catalog: StoredCatalog): FileCatalog {
  return { revision: catalog.revision, files: catalog.files.map(cloneFile) }
}

// 所有操作经同名 Web Lock：写操作用独占模式，读操作用共享模式，
// 保证多标签页与多操作之间 catalog 与正文的一致性。
// 没有 navigator.locks 的环境（Safari ≤15.3）直接执行，跨标签写入不做协调，
// 这是接受的限制。后端选定后发生的任何运行期错误都统一抛 FileStorageError，不再降级。
async function operate<T>(mode: LockMode, task: (backend: Backend) => Promise<T>): Promise<T> {
  try {
    const run = () => getBackend().then(task)
    if (typeof navigator !== 'undefined' && typeof navigator.locks?.request === 'function') {
      return await navigator.locks.request(LOCK_NAME, { mode }, run)
    }
    return await run()
  }
  catch (error) {
    throw new FileStorageError({ cause: error })
  }
}

export function initializeFileStorage(
  defaultFile: NewFile,
): Promise<{ catalog: FileCatalog, persistent: boolean }> {
  return operate('exclusive', async (backend) => {
    const existing = await backend.meta.readCatalog()
    if (existing.revision > 0 || existing.files.length > 0) {
      return { catalog: publicCatalog(existing), persistent: backend.persistent }
    }
    await backend.content.write(defaultFile.id, defaultFile.content)
    const catalog: StoredCatalog = { revision: 1, files: [cloneFile(defaultFile)] }
    try {
      await backend.meta.commitCatalog(catalog, { [defaultFile.id]: 1 })
    }
    catch (error) {
      // 元数据提交失败时清理刚写入的正文，避免留下孤儿文件。
      await backend.content.remove(defaultFile.id)
      throw error
    }
    return { catalog: publicCatalog(catalog), persistent: backend.persistent }
  })
}

export function getFileCatalog(): Promise<FileCatalog> {
  return operate('shared', async backend => publicCatalog(await backend.meta.readCatalog()))
}

export function createFile(input: NewFile): Promise<{ catalog: FileCatalog, file: MarkdownFile }> {
  return operate('exclusive', async (backend) => {
    const current = await backend.meta.readCatalog()
    const file = { ...cloneFile(input), name: uniqueFileName(input.name, current.files) }
    await backend.content.write(file.id, input.content)
    const catalog: StoredCatalog = { revision: current.revision + 1, files: [...current.files, file] }
    try {
      await backend.meta.commitCatalog(catalog, { [file.id]: 1 })
    }
    catch (error) {
      // 元数据提交失败时清理刚写入的正文，避免留下孤儿文件。
      await backend.content.remove(file.id)
      throw error
    }
    return { catalog: publicCatalog(catalog), file }
  })
}

export function renameFile(id: string, name: string): Promise<FileCatalog> {
  return operate('exclusive', async (backend) => {
    const current = await backend.meta.readCatalog()
    if (!current.files.some(file => file.id === id)) {
      return publicCatalog(current)
    }
    const uniqueName = uniqueFileName(name, current.files, id)
    const catalog: StoredCatalog = {
      revision: current.revision + 1,
      files: current.files.map(file =>
        file.id === id ? { ...file, name: uniqueName, updatedAt: Date.now() } : file),
    }
    await backend.meta.commitCatalog(catalog, {})
    return publicCatalog(catalog)
  })
}

export function deleteFile(
  id: string,
  replacement: NewFile,
): Promise<{ catalog: FileCatalog, nextFileId: string | null }> {
  return operate('exclusive', async (backend) => {
    const current = await backend.meta.readCatalog()
    const index = current.files.findIndex(file => file.id === id)
    if (index < 0) {
      return { catalog: publicCatalog(current), nextFileId: null }
    }
    const files = current.files.filter(file => file.id !== id)
    let nextFileId: string | null = files[index]?.id ?? files[index - 1]?.id ?? null
    let created: MarkdownFile | undefined
    if (files.length === 0) {
      created = { ...cloneFile(replacement), name: uniqueFileName(replacement.name, files) }
      files.push(created)
      nextFileId = created.id
    }

    const versions: Record<string, number | undefined> = { [id]: undefined }
    if (created) {
      versions[created.id] = 1
      // 先写 replacement 正文再提交元数据，失败时回滚正文，避免孤儿文件。
      await backend.content.write(created.id, replacement.content)
    }
    const catalog: StoredCatalog = { revision: current.revision + 1, files }
    try {
      await backend.meta.commitCatalog(catalog, versions)
    }
    catch (error) {
      if (created) {
        await backend.content.remove(created.id)
      }
      throw error
    }
    if (id !== created?.id) {
      await backend.content.remove(id)
    }
    return { catalog: publicCatalog(catalog), nextFileId }
  })
}

export function readFile(id: string): Promise<FileSnapshot> {
  return operate('shared', async (backend) => {
    const catalog = await backend.meta.readCatalog()
    if (!catalog.files.some(file => file.id === id)) {
      return { content: '', version: 0 }
    }
    // catalog 里有记录但正文缺失是异常状态，不能让上层当成空文档继续编辑。
    // 版本号缺失时按 0 处理（线上旧记录可能没有 version）。
    const version = (await backend.meta.readVersion(id)) ?? 0
    return { content: await backend.content.read(id), version }
  })
}

export function saveFile(id: string, content: string): Promise<number | false> {
  return operate('exclusive', async (backend) => {
    const catalog = await backend.meta.readCatalog()
    if (!catalog.files.some(file => file.id === id)) {
      return false
    }
    // 先确认文件存在并写正文，再单独提交 version+1；
    // 锁串行化保证读 version 与提交之间不会被其他写者插队。
    const version = ((await backend.meta.readVersion(id)) ?? 0) + 1
    await backend.content.write(id, content)
    await backend.meta.commitCatalog(catalog, { [id]: version })
    return version
  })
}

export async function __resetFileStorage(): Promise<void> {
  try {
    await resetBackend()
  }
  catch (error) {
    throw new FileStorageError({ cause: error })
  }
}

// 申请持久化存储，尽力而为：persist 不存在或已持久化时直接返回，结果与错误都忽略。
export async function requestPersistentStorage(): Promise<void> {
  try {
    const storage = typeof navigator === 'undefined' ? undefined : navigator.storage
    if (typeof storage?.persist !== 'function' || await storage.persisted()) {
      return
    }
    await storage.persist()
  }
  catch {
    // 持久化只是尽力而为，不提示用户。
  }
}
