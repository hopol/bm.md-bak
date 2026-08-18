import { afterEach, describe, expect, it, vi } from 'vitest'

import { version } from '@/package.json'
import { DCStorage } from './index'

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.DC_UPLOAD_URL
})

describe('dc storage', () => {
  it('上传成功时返回响应中的 URL', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ url: 'https://img.example.com/a.png' }))
    vi.stubGlobal('fetch', fetchMock)
    process.env.DC_UPLOAD_URL = 'https://upload.example.com'

    const storage = new DCStorage()
    const result = await storage.upload({
      file: new Blob(['image'], { type: 'application/octet-stream' }),
      extension: 'png',
      contentType: 'image/png',
    })

    expect(fetchMock).toHaveBeenCalledWith('https://upload.example.com', expect.objectContaining({
      method: 'POST',
      headers: { 'User-Agent': `bmmd/${version}` },
    }))
    const request = fetchMock.mock.calls[0]?.[1]
    const uploadedFile = (request?.body as FormData).get('image') as File
    expect(uploadedFile.name).toBe('image.png')
    expect(uploadedFile.type).toBe('image/png')
    expect(result.url).toBe('https://img.example.com/a.png')
  })

  it('响应缺少 URL 时抛出 dc 存储错误', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(Response.json({})))

    await expect(new DCStorage().upload({
      file: new Blob(['image'], { type: 'image/png' }),
      extension: 'png',
      contentType: 'image/png',
    })).rejects.toMatchObject({ provider: 'dc' })
  })

  it('http 失败时抛出 dc 存储错误', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response('failed', { status: 500 })))

    await expect(new DCStorage().upload({
      file: new Blob(['image'], { type: 'image/png' }),
      extension: 'png',
      contentType: 'image/png',
    })).rejects.toMatchObject({ provider: 'dc' })
  })
})
