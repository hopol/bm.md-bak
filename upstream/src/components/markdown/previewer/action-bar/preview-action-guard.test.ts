import { describe, expect, it, vi } from 'vitest'
import { runPreviewAction } from './preview-action-guard'

describe('预览动作守卫', () => {
  it('点击瞬间未就绪时不执行动作', async () => {
    const action = vi.fn()

    await runPreviewAction(action, () => false)

    expect(action).not.toHaveBeenCalled()
  })

  it('点击瞬间仍就绪时执行动作', async () => {
    const action = vi.fn()

    await runPreviewAction(action, () => true)

    expect(action).toHaveBeenCalledOnce()
  })
})
