import { describe, expect, it, vi } from 'vitest'

import { restoreScrollState } from './restore-scroll-state'

describe('预览滚动状态恢复', () => {
  it('立即设置合成层 transform', () => {
    const target = { style: { transform: '' } }
    const scheduler = vi.fn()

    restoreScrollState(target, scheduler)

    expect(target.style.transform).toBe('translateZ(0)')
  })

  it('一帧后清除 transform', () => {
    const removeProperty = vi.fn()
    const target = { style: { transform: '', removeProperty } }
    let callback: (() => void) | undefined

    restoreScrollState(target, next => callback = next)
    callback?.()

    expect(removeProperty).toHaveBeenCalledOnce()
    expect(removeProperty).toHaveBeenCalledWith('transform')
  })

  it('只调度一帧', () => {
    const scheduler = vi.fn()

    restoreScrollState({ style: { transform: '' } }, scheduler)

    expect(scheduler).toHaveBeenCalledOnce()
  })

  it('target 为空时安全返回', () => {
    const scheduler = vi.fn()

    expect(() => restoreScrollState(null, scheduler)).not.toThrow()
    expect(scheduler).not.toHaveBeenCalled()
  })
})
