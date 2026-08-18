import { beforeEach, describe, expect, it, vi } from 'vitest'

import { formatMarkdown } from './format'

const mocks = vi.hoisted(() => ({
  lint: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}))

vi.mock('@/lib/markdown/browser', () => ({ markdown: { lint: mocks.lint } }))
vi.mock('sonner', () => ({ toast: { success: mocks.success, error: mocks.error } }))

describe('formatMarkdown', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.lint.mockResolvedValue({ result: '格式化正文' })
  })

  it('应用成功后显示成功提示', async () => {
    const setter = vi.fn(() => true)

    await formatMarkdown('原正文', setter)

    expect(setter).toHaveBeenCalledWith('格式化正文')
    expect(mocks.success).toHaveBeenCalledWith('格式化成功')
  })

  it('会话过期拒绝应用时不显示成功或失败', async () => {
    await formatMarkdown('原正文', () => false)

    expect(mocks.success).not.toHaveBeenCalled()
    expect(mocks.error).not.toHaveBeenCalled()
  })
})
