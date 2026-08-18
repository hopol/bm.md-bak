import { $fetch } from 'ofetch'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { env } from '@/env'

import { uploadImage } from './upload-image'

vi.mock('ofetch', () => ({
  $fetch: vi.fn(),
}))

vi.mock('@/env', () => ({
  env: {
    VITE_API_URL: undefined,
  },
}))

const formData = new FormData()

beforeEach(() => {
  vi.mocked($fetch).mockReset()
  env.VITE_API_URL = undefined
})

describe('uploadImage', () => {
  it('请求同源上传 URL', async () => {
    vi.mocked($fetch).mockResolvedValue({ url: 'https://cdn.example.com/image.png' })

    await uploadImage(formData)

    expect($fetch).toHaveBeenCalledWith('/api/upload/image', {
      method: 'POST',
      body: formData,
    })
  })

  it.each([
    ['https://api.example.com', 'https://api.example.com/api/upload/image'],
    ['https://api.example.com/', 'https://api.example.com/api/upload/image'],
  ])('使用跨域 API 基址 %s 且不携带 credentials', async (baseUrl, expectedUrl) => {
    env.VITE_API_URL = baseUrl
    vi.mocked($fetch).mockResolvedValue({ url: 'https://cdn.example.com/image.png' })

    await uploadImage(formData)

    expect($fetch).toHaveBeenCalledWith(expectedUrl, {
      method: 'POST',
      body: formData,
    })
    expect(vi.mocked($fetch).mock.calls[0][1]).not.toHaveProperty('credentials')
  })

  it('使用 Zod 校验成功响应', async () => {
    vi.mocked($fetch).mockResolvedValue({ url: 'https://cdn.example.com/image.png' })

    await expect(uploadImage(formData)).resolves.toEqual({
      url: 'https://cdn.example.com/image.png',
    })
  })

  it('拒绝非法成功响应', async () => {
    vi.mocked($fetch).mockResolvedValue({ message: 'ok' })

    await expect(uploadImage(formData)).rejects.toThrow('图片上传响应格式错误')
  })

  it('提取服务端错误文案', async () => {
    vi.mocked($fetch).mockRejectedValue({
      data: { error: '只支持上传图片文件' },
    })

    await expect(uploadImage(formData)).rejects.toThrow('只支持上传图片文件')
  })
})
