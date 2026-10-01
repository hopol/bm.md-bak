import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  cleanup: undefined as (() => void) | undefined,
  syncExternalChanges: vi.fn<() => Promise<void>>(),
  flushPendingSaves: vi.fn<() => Promise<void>>(),
  windowListeners: new Map<string, EventListener>(),
  documentListeners: new Map<string, EventListener>(),
  removeWindowListener: vi.fn(),
  removeDocumentListener: vi.fn(),
}))

vi.mock('react', () => ({
  useEffect: (effect: () => void | (() => void)) => {
    mocks.cleanup = effect() ?? undefined
  },
}))

vi.mock('@/stores/files', () => ({
  useFilesStore: {
    getState: () => ({
      syncExternalChanges: mocks.syncExternalChanges,
      flushPendingSaves: mocks.flushPendingSaves,
    }),
  },
}))

class FakeBroadcastChannel {
  static instances: FakeBroadcastChannel[] = []
  listeners = new Set<() => void>()

  constructor() {
    FakeBroadcastChannel.instances.push(this)
  }

  postMessage(): void {
    // 广播不回环到本标签，测试手动触发 emit。
  }

  addEventListener(type: string, listener: () => void): void {
    if (type === 'message') {
      this.listeners.add(listener)
    }
  }

  removeEventListener(_type: string, listener: () => void): void {
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

function emitWindow(type: string, event: Event): void {
  mocks.windowListeners.get(type)?.(event)
}

function emitDocument(type: string, event: Event): void {
  mocks.documentListeners.get(type)?.(event)
}

function emitBroadcast(): void {
  FakeBroadcastChannel.instances[0]?.emit()
}

let useFilesSync: typeof import('./use-files-sync')['useFilesSync']

describe('useFilesSync', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()
    FakeBroadcastChannel.instances = []
    mocks.cleanup = undefined
    mocks.windowListeners.clear()
    mocks.documentListeners.clear()
    mocks.syncExternalChanges.mockResolvedValue(undefined)
    mocks.flushPendingSaves.mockResolvedValue(undefined)
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel)
    vi.stubGlobal('window', {
      addEventListener: (type: string, listener: EventListener) => mocks.windowListeners.set(type, listener),
      removeEventListener: (type: string, listener: EventListener) => {
        mocks.removeWindowListener(type, listener)
        mocks.windowListeners.delete(type)
      },
    })
    vi.stubGlobal('document', {
      visibilityState: 'visible',
      addEventListener: (type: string, listener: EventListener) => mocks.documentListeners.set(type, listener),
      removeEventListener: (type: string, listener: EventListener) => {
        mocks.removeDocumentListener(type, listener)
        mocks.documentListeners.delete(type)
      },
    })
    useFilesSync = (await import('./use-files-sync')).useFilesSync
  })

  it('挂载立即同步，频道消息与 focus 均请求同步', async () => {
    useFilesSync()
    await vi.waitFor(() => expect(mocks.syncExternalChanges).toHaveBeenCalledOnce())
    emitBroadcast()
    await vi.waitFor(() => expect(mocks.syncExternalChanges).toHaveBeenCalledTimes(2))
    emitWindow('focus', new Event('focus'))
    await vi.waitFor(() => expect(mocks.syncExternalChanges).toHaveBeenCalledTimes(3))
  })

  it('hidden 时 flush，pagehide 时 flush', () => {
    vi.stubGlobal('document', {
      visibilityState: 'hidden',
      addEventListener: (type: string, listener: EventListener) => mocks.documentListeners.set(type, listener),
      removeEventListener: (type: string, listener: EventListener) => {
        mocks.removeDocumentListener(type, listener)
        mocks.documentListeners.delete(type)
      },
    })
    useFilesSync()
    emitDocument('visibilitychange', new Event('visibilitychange'))
    emitWindow('pagehide', new Event('pagehide'))
    expect(mocks.flushPendingSaves).toHaveBeenCalledTimes(2)
  })

  it('卸载时退订频道并移除全部监听', () => {
    useFilesSync()
    mocks.cleanup?.()
    expect(mocks.removeWindowListener).toHaveBeenCalledTimes(2)
    expect(mocks.removeDocumentListener).toHaveBeenCalledOnce()
    expect(mocks.windowListeners.size).toBe(0)
    expect(mocks.documentListeners.size).toBe(0)
    emitBroadcast()
    expect(mocks.syncExternalChanges).toHaveBeenCalledOnce()
  })
})
