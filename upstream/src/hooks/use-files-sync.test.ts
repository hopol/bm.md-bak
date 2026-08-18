import { beforeEach, describe, expect, it, vi } from 'vitest'

import { FILES_SIGNAL_KEY } from '@/lib/files-sync'

import { useFilesSync } from './use-files-sync'

function deferred() {
  let resolve = () => {}
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

const mocks = vi.hoisted(() => ({
  cleanup: undefined as (() => void) | undefined,
  syncExternalChanges: vi.fn<() => Promise<void>>(),
  flushPendingSaves: vi.fn<() => Promise<void>>(),
  windowListeners: new Map<string, EventListener>(),
  documentListeners: new Map<string, EventListener>(),
  removeWindowListener: vi.fn(),
  removeDocumentListener: vi.fn(),
  setItem: vi.fn(),
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

function emitWindow(type: string, event: Event): void {
  mocks.windowListeners.get(type)?.(event)
}

function emitDocument(type: string, event: Event): void {
  mocks.documentListeners.get(type)?.(event)
}

function storageEvent(newValue: string | null, key = FILES_SIGNAL_KEY): StorageEvent {
  return { key, newValue } as StorageEvent
}

describe('useFilesSync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.cleanup = undefined
    mocks.windowListeners.clear()
    mocks.documentListeners.clear()
    mocks.syncExternalChanges.mockResolvedValue(undefined)
    mocks.flushPendingSaves.mockResolvedValue(undefined)
    vi.stubGlobal('localStorage', { setItem: mocks.setItem })
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
  })

  it('挂载立即同步，合法 catalog/content signal 均请求同步且不回声', async () => {
    useFilesSync()
    await vi.waitFor(() => expect(mocks.syncExternalChanges).toHaveBeenCalledOnce())
    emitWindow('storage', storageEvent(JSON.stringify({ kind: 'catalog', revision: 2, nonce: 'a' })))
    await vi.waitFor(() => expect(mocks.syncExternalChanges).toHaveBeenCalledTimes(2))
    emitWindow('storage', storageEvent(JSON.stringify({ kind: 'content', fileId: 'one', version: 3, nonce: 'b' })))
    await vi.waitFor(() => expect(mocks.syncExternalChanges).toHaveBeenCalledTimes(3))
    expect(mocks.setItem).not.toHaveBeenCalled()
  })

  it('忽略非目标和非法 signal', async () => {
    useFilesSync()
    await vi.waitFor(() => expect(mocks.syncExternalChanges).toHaveBeenCalledOnce())
    emitWindow('storage', storageEvent('损坏'))
    emitWindow('storage', storageEvent(JSON.stringify({ kind: 'catalog', revision: 2, nonce: 'n' }), 'other'))
    expect(mocks.syncExternalChanges).toHaveBeenCalledOnce()
  })

  it('in-flight 期间合并事件并在完成后追赶一次', async () => {
    const first = deferred()
    mocks.syncExternalChanges.mockReturnValueOnce(first.promise).mockResolvedValue(undefined)
    useFilesSync()
    emitWindow('focus', new Event('focus'))
    emitDocument('visibilitychange', new Event('visibilitychange'))
    emitWindow('storage', storageEvent(JSON.stringify({ kind: 'content', fileId: 'one', version: 2, nonce: 'n' })))
    expect(mocks.syncExternalChanges).toHaveBeenCalledOnce()
    first.resolve()
    await vi.waitFor(() => expect(mocks.syncExternalChanges).toHaveBeenCalledTimes(2))
  })

  it('hidden/pagehide flush，并在卸载时完整清理', () => {
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
    mocks.cleanup?.()
    expect(mocks.removeWindowListener).toHaveBeenCalledTimes(3)
    expect(mocks.removeDocumentListener).toHaveBeenCalledOnce()
    expect(mocks.windowListeners.size).toBe(0)
    expect(mocks.documentListeners.size).toBe(0)
  })
})
