import { describe, expect, it, vi } from 'vitest'
import { openApiClient } from '../helpers/openapi-client'

vi.mock('@/lib/markdown/render/html', () => ({
  render: () => {
    throw new Error('SENSITIVE_INTERNAL_ERROR')
  },
  renderPreview: () => {
    throw new Error('SENSITIVE_INTERNAL_ERROR')
  },
}))

describe('openapi 内部错误响应', () => {
  it('执行异常保持稳定 500 结构且不泄露底层错误', async () => {
    const result = await openApiClient.postJson('/api/markdown/render', {
      markdown: '# 标题',
    })

    expect(result.matched).toBe(true)
    if (!result.matched) {
      throw new Error('请求未匹配')
    }

    const body = await result.response.text()
    expect(result.response.status).toBe(500)
    expect(JSON.parse(body)).toMatchObject({
      defined: false,
      code: 'INTERNAL_SERVER_ERROR',
      status: 500,
      message: expect.any(String),
    })
    expect(body).not.toContain('SENSITIVE_INTERNAL_ERROR')
  })
})
