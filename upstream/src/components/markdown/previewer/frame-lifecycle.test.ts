import { describe, expect, it, vi } from 'vitest'
import { getReadySignature, PreviewFrameLifecycle } from './frame-lifecycle'

describe('预览 iframe 生命周期', () => {
  it('文件 A→B→A 时忽略旧实例的延迟 load，直到新实例同步成功', () => {
    const commit = vi.fn<(signature: string | null) => void>()
    const lifecycle = new PreviewFrameLifecycle(commit)
    const firstA = {}
    const frameB = {}
    const secondA = {}

    lifecycle.reset(firstA)
    lifecycle.markLoaded(firstA)
    lifecycle.markSynced(firstA, 'A')
    expect(lifecycle.isReady(firstA)).toBe(true)

    lifecycle.reset(frameB)
    lifecycle.reset(secondA)
    expect(lifecycle.markLoaded(firstA)).toBe(false)
    expect(lifecycle.markSynced(firstA, 'A')).toBe(false)
    expect(lifecycle.isReady(secondA)).toBe(false)

    lifecycle.markLoaded(secondA)
    expect(lifecycle.isReady(secondA)).toBe(false)
    lifecycle.markSynced(secondA, 'A')
    expect(lifecycle.isReady(secondA)).toBe(true)
  })

  it('宽度切换再恢复时，新 iframe 延迟 load 期间保持未就绪', () => {
    const lifecycle = new PreviewFrameLifecycle(() => undefined)
    const mobile = {}
    const desktop = {}
    const nextMobile = {}

    lifecycle.reset(mobile)
    lifecycle.markLoaded(mobile)
    lifecycle.markSynced(mobile, 'mobile')
    lifecycle.reset(desktop)
    lifecycle.reset(nextMobile)

    expect(lifecycle.isReady(nextMobile)).toBe(false)
    lifecycle.markLoaded(desktop)
    lifecycle.markSynced(desktop, 'desktop')
    expect(lifecycle.isReady(nextMobile)).toBe(false)
  })

  it('错误预览不提交 ready 签名', () => {
    expect(getReadySignature('失败输入', false, true)).toBeNull()
    expect(getReadySignature('成功输入', true, true)).toBe('成功输入')
    expect(getReadySignature('过期输入', true, false)).toBeNull()
  })
})
