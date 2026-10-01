import type { Backend, StoredCatalog } from './types'
import { cloneCatalog } from './types'

// IndexedDB 不可用时的会话内兜底后端：catalog 与正文都只驻留内存，刷新即丢失。
export function createMemoryBackend(): Backend {
  let catalog: StoredCatalog = { revision: 0, files: [] }
  const contents = new Map<string, string>()
  const versions = new Map<string, number>()
  return {
    persistent: false,
    contentBackend: 'memory',
    meta: {
      readCatalog: async () => cloneCatalog(catalog),
      readVersion: async id => versions.get(id),
      commitCatalog: async (next, changedVersions) => {
        for (const [id, version] of Object.entries(changedVersions)) {
          if (version === undefined) {
            versions.delete(id)
            contents.delete(id)
          }
          else {
            versions.set(id, version)
          }
        }
        catalog = cloneCatalog(next)
      },
    },
    content: {
      read: async (id) => {
        const content = contents.get(id)
        if (content === undefined) {
          throw new DOMException(`正文缺失：${id}`, 'NotFoundError')
        }
        return content
      },
      write: async (id, content) => {
        contents.set(id, content)
      },
      remove: async (id) => {
        contents.delete(id)
      },
    },
  }
}
