import { privateEnvKeys } from '@/env'

// 预加载 EdgeKV 中的环境变量（如果可用）
export async function preloadEdgeKVEnv() {
  if (!globalThis.edgeKVCache) {
    globalThis.edgeKVCache = {}
  }
  const edgeKVCache = globalThis.edgeKVCache
  if (Object.keys(edgeKVCache).length) {
    console.info('EdgeKV ENV already preloaded:', Object.keys(edgeKVCache))
    // 已经预加载过，直接返回
    return
  }
  if (typeof EdgeKV !== 'undefined') {
    try {
      const edgeKV = new EdgeKV({ namespace: 'bm-md-env' })
      // 加载所有需要的环境变量
      await Promise.all(
        privateEnvKeys
          .map(async (key) => {
            const value = await edgeKV.get(key, { type: 'text' }).catch(() => null)
            if (value) {
              edgeKVCache[key] = value
            }
          }),
      )
      console.info('EdgeKV ENV preload successfully:', Object.keys(edgeKVCache))
    }
    catch (error) {
      console.warn('Failed to preload EdgeKV environment variables:', error)
    }
  }
}
