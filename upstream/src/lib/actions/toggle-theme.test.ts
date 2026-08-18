import { afterEach, describe, expect, it, vi } from 'vitest'

import { toggleTheme } from './toggle-theme'

describe('toggleTheme', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('无 View Transition API 时直接切换主题', () => {
    const setTheme = vi.fn()
    vi.stubGlobal('document', {})

    toggleTheme(false, setTheme)

    expect(setTheme).toHaveBeenCalledWith('dark')
  })

  it('api 可用且未减少动态效果时在 transition callback 中切换主题', () => {
    const setTheme = vi.fn()
    const startViewTransition = vi.fn<(callback: () => void) => void>()
    vi.stubGlobal('document', { startViewTransition })
    vi.stubGlobal('window', {
      matchMedia: vi.fn(() => ({ matches: false })),
    })

    toggleTheme(true, setTheme)

    expect(startViewTransition).toHaveBeenCalledOnce()
    expect(setTheme).not.toHaveBeenCalled()

    const callback = startViewTransition.mock.calls[0]?.[0]
    expect(callback).toBeDefined()
    callback?.()

    expect(setTheme).toHaveBeenCalledWith('light')
  })

  it('减少动态效果时直接切换且不调用 transition', () => {
    const setTheme = vi.fn()
    const startViewTransition = vi.fn()
    vi.stubGlobal('document', { startViewTransition })
    vi.stubGlobal('window', {
      matchMedia: vi.fn(() => ({ matches: true })),
    })

    toggleTheme(false, setTheme)

    expect(setTheme).toHaveBeenCalledWith('dark')
    expect(startViewTransition).not.toHaveBeenCalled()
  })
})
