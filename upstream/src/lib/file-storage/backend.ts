import type { Backend } from './types'
import { getDB, idbBackend, readIdbBackendMarker, resetIndexedDB } from './indexeddb'
import { createMemoryBackend } from './memory'
import { hasOpfsCatalog, opfsBackend, probeOpfsRoot, resetOpfs } from './opfs'

let backendPromise: Promise<Backend> | null = null

// 后端只在首次使用时选定一次，所有调用共享同一个 Promise，会话内不再切换：
// 1. OPFS 可用 → 元数据与正文全部在 OPFS（catalog.json + `<id>.md`），不打开 IndexedDB；
//    例外：OPFS 还没有 catalog.json 且 IDB catalog 记录了 contentBackend === 'indexeddb'
//    （IDB 后端每次提交 catalog 都会写入该标记）时继续用 IndexedDB，避免旧正文被读成空白。
//    线上旧数据没有该标记，一律忽略、不读也不删。
// 2. OPFS 不可用 → 元数据与正文都在 IndexedDB（bm.md v2）。
// 3. IndexedDB 也打不开 → 全部驻留内存，persistent=false。
async function selectBackend(): Promise<Backend> {
  const root = await probeOpfsRoot()
  if (root) {
    if (await hasOpfsCatalog(root) || !(await readIdbBackendMarker())) {
      return opfsBackend(root)
    }
  }
  try {
    await getDB()
    return idbBackend()
  }
  catch {
    return createMemoryBackend()
  }
}

// 每次操作都通过这里的 Promise 获取后端；选择失败时清空缓存，允许下次重试。
export function getBackend(): Promise<Backend> {
  if (!backendPromise) {
    const selecting = selectBackend()
    selecting.catch(() => {
      if (backendPromise === selecting) {
        backendPromise = null
      }
    })
    backendPromise = selecting
  }
  return backendPromise
}

// 测试专用：清空 IDB 与 OPFS 数据并重置后端选择。
export async function resetBackend(): Promise<void> {
  backendPromise = null
  await resetOpfs()
  await resetIndexedDB()
}
