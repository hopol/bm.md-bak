import type { ScalarBrowserApi, ScalarLoaderDependencies, ScalarReferenceInstance } from './-docs-scalar-loader'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { loadScalarReference } from './-docs-scalar-loader'

function createTestDependencies() {
  const scripts: Array<{
    src: string
    onload: ((event: Event) => unknown) | null
    onerror: ((event: Event) => unknown) | null
    remove: () => void
  }> = []
  const container = { replaceChildren: vi.fn() }
  const timers: Array<{ callback: () => void, delay: number }> = []
  let api: ScalarBrowserApi | null = null

  const dependencies: ScalarLoaderDependencies = {
    getContainer: () => container,
    getApi: () => api,
    createScript: () => {
      const script: (typeof scripts)[number] = {
        src: '',
        onload: null,
        onerror: null,
        remove: vi.fn(),
      }
      scripts.push(script)
      return script
    },
    appendScript: vi.fn(),
    schedule: callback => callback(),
    setTimer: (callback, delay) => {
      const timer = { callback, delay }
      timers.push(timer)
      return timer
    },
    clearTimer: vi.fn(),
  }

  return {
    container,
    dependencies,
    scripts,
    timers,
    setApi: (nextApi: ScalarBrowserApi | null) => {
      api = nextApi
    },
  }
}

describe('loadScalarReference', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('脚本加载失败时移除脚本并报告错误', () => {
    const test = createTestDependencies()
    const onStateChange = vi.fn()

    loadScalarReference(onStateChange, test.dependencies)
    test.scripts[0].onerror?.({} as Event)

    expect(test.scripts[0].remove).toHaveBeenCalledOnce()
    expect(test.dependencies.clearTimer).toHaveBeenCalledWith(test.timers[0])
    expect(onStateChange).toHaveBeenCalledWith('error')
  })

  it('加载超时后报告错误并允许重新加载', () => {
    const test = createTestDependencies()
    const onStateChange = vi.fn()

    loadScalarReference(onStateChange, test.dependencies)
    expect(test.timers[0].delay).toBe(15_000)

    test.timers[0].callback()
    loadScalarReference(onStateChange, test.dependencies)

    expect(test.scripts[0].remove).toHaveBeenCalledOnce()
    expect(onStateChange).toHaveBeenCalledWith('error')
    expect(test.scripts).toHaveLength(2)
  })

  it('失败后重试会重新创建并加载脚本', () => {
    const test = createTestDependencies()
    const onStateChange = vi.fn()

    const disposeFirstLoad = loadScalarReference(onStateChange, test.dependencies)
    test.scripts[0].onerror?.({} as Event)
    disposeFirstLoad()
    loadScalarReference(onStateChange, test.dependencies)

    const createApiReference = vi.fn(() => ({ destroy: vi.fn() }))
    test.setApi({ createApiReference })
    test.scripts[1].onload?.({} as Event)

    expect(test.scripts).toHaveLength(2)
    expect(test.dependencies.appendScript).toHaveBeenCalledTimes(2)
    expect(createApiReference).toHaveBeenCalledOnce()
    expect(test.dependencies.clearTimer).toHaveBeenLastCalledWith(test.timers[1])
    expect(onStateChange).toHaveBeenLastCalledWith('ready')
  })

  it('卸载后即使旧 onload 被调用也不会初始化', () => {
    const test = createTestDependencies()
    const createApiReference = vi.fn<ScalarBrowserApi['createApiReference']>()
    const onStateChange = vi.fn()

    const dispose = loadScalarReference(onStateChange, test.dependencies)
    const staleOnload = test.scripts[0].onload
    const staleTimer = test.timers[0].callback
    test.setApi({ createApiReference })
    dispose()
    staleOnload?.({} as Event)
    staleTimer()

    expect(createApiReference).not.toHaveBeenCalled()
    expect(onStateChange).not.toHaveBeenCalled()
    expect(test.dependencies.clearTimer).toHaveBeenCalledWith(test.timers[0])
  })

  it('卸载时销毁已创建的实例', () => {
    const test = createTestDependencies()
    const instance: ScalarReferenceInstance = { destroy: vi.fn() }
    test.setApi({ createApiReference: vi.fn(() => instance) })

    const dispose = loadScalarReference(vi.fn(), test.dependencies)
    dispose()

    expect(instance.destroy).toHaveBeenCalledOnce()
    expect(test.container.replaceChildren).toHaveBeenCalledTimes(2)
  })
})
