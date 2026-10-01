import { beforeEach, describe, expect, it, vi } from 'vitest'

type Listener = () => void

class FakeBroadcastChannel {
  static instances: FakeBroadcastChannel[] = []
  name: string
  listeners = new Set<Listener>()
  posted: unknown[] = []

  constructor(name: string) {
    this.name = name
    FakeBroadcastChannel.instances.push(this)
  }

  postMessage(message: unknown): void {
    this.posted.push(message)
  }

  addEventListener(type: string, listener: Listener): void {
    if (type === 'message') {
      this.listeners.add(listener)
    }
  }

  removeEventListener(_type: string, listener: Listener): void {
    this.listeners.delete(listener)
  }

  emit(): void {
    for (const listener of this.listeners) {
      listener()
    }
  }

  close(): void {
    // 无需关闭。
  }
}

type FilesSyncModule = typeof import('./files-sync')

let filesSync: FilesSyncModule

describe('files-sync', () => {
  beforeEach(async () => {
    FakeBroadcastChannel.instances = []
    vi.resetModules()
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)
    filesSync = await import('./files-sync')
  })

  it('notify 向 bm.md.files 频道广播空消息', () => {
    filesSync.notifyFilesChanged()
    expect(FakeBroadcastChannel.instances).toHaveLength(1)
    expect(FakeBroadcastChannel.instances[0].name).toBe('bm.md.files')
    expect(FakeBroadcastChannel.instances[0].posted).toEqual([null])
  })

  it('多个订阅者都收到通知，退订后不再收到', () => {
    const first = vi.fn()
    const second = vi.fn()
    const unsubscribe = filesSync.onFilesChanged(first)
    filesSync.onFilesChanged(second)
    filesSync.notifyFilesChanged()
    FakeBroadcastChannel.instances[0].emit()
    expect(first).toHaveBeenCalledOnce()
    expect(second).toHaveBeenCalledOnce()

    unsubscribe()
    FakeBroadcastChannel.instances[0].emit()
    expect(first).toHaveBeenCalledOnce()
    expect(second).toHaveBeenCalledTimes(2)
  })

  it('broadcastChannel 不可用时为 no-op', async () => {
    vi.stubGlobal('BroadcastChannel', undefined)
    vi.resetModules()
    filesSync = await import('./files-sync')

    const listener = vi.fn()
    expect(() => {
      filesSync.notifyFilesChanged()
      filesSync.onFilesChanged(listener)()
    }).not.toThrow()
  })
})
