import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.resetModules()
  vi.doUnmock('@orpc/server')
  vi.doUnmock('@orpc/server/message-port')
  vi.doUnmock('@/lib/log-safe-error')
  vi.doUnmock('./router')
  Reflect.deleteProperty(globalThis, 'self')
})

describe('markdown worker RPC', () => {
  it('导入 worker.ts 时创建 RPCHandler 并升级 self 消息端口', async () => {
    const interceptor = { name: 'worker-error-interceptor' }
    const workerRouter = { markdown: { render: vi.fn() } }
    const upgrade = vi.fn<(port: MessagePort) => void>()
    const rpcHandlerConstructor = vi.fn<(router: unknown, options: unknown) => void>()
    const onError = vi.fn<(callback: (error: unknown) => void) => unknown>(() => interceptor)
    const logSafeError = vi.fn<(message: string, error: unknown) => void>()

    class MockRPCHandler {
      upgrade = upgrade

      constructor(router: unknown, options: unknown) {
        rpcHandlerConstructor(router, options)
      }
    }

    vi.doMock('@orpc/server/message-port', () => ({ RPCHandler: MockRPCHandler }))
    vi.doMock('@orpc/server', () => ({ onError }))
    vi.doMock('@/lib/log-safe-error', () => ({ logSafeError }))
    vi.doMock('./router', () => ({ workerRouter }))

    const selfPort = { postMessage: vi.fn() } as unknown as MessagePort
    Object.defineProperty(globalThis, 'self', { value: selfPort, configurable: true })

    await import('./worker')

    expect(onError).toHaveBeenCalledTimes(1)
    expect(rpcHandlerConstructor).toHaveBeenCalledTimes(1)
    expect(rpcHandlerConstructor).toHaveBeenCalledWith(workerRouter, { interceptors: [interceptor] })
    expect(upgrade).toHaveBeenCalledTimes(1)
    expect(upgrade).toHaveBeenCalledWith(selfPort)
  })

  it('workerRouter 暴露 preview 但普通 router 不暴露 preview', async () => {
    const { router, workerRouter } = await import('./router')

    expect('preview' in workerRouter.markdown).toBe(true)
    expect(workerRouter.markdown.preview).toBeDefined()
    expect('preview' in router.markdown).toBe(false)
  })
})
