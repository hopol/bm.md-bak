import { AwsClient } from 'aws4fetch'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { S3Storage, StorageError } from './index'

const fetchMock = vi.hoisted(() => vi.fn())

vi.mock('aws4fetch', () => ({
  AwsClient: vi.fn(class AwsClient {
    fetch = fetchMock
  }),
}))

beforeEach(() => {
  process.env.S3_ACCESS_KEY_ID = 'key'
  process.env.S3_SECRET_ACCESS_KEY = 'secret'
  process.env.S3_ENDPOINT = 'https://s3.example.com'
  process.env.S3_BUCKET = 'bucket'
  process.env.S3_PUBLIC_BASE_URL = 'https://cdn.example.com/'
  fetchMock.mockReset()
  vi.mocked(AwsClient).mockClear()
})

afterEach(() => {
  delete process.env.S3_ACCESS_KEY_ID
  delete process.env.S3_SECRET_ACCESS_KEY
  delete process.env.S3_ENDPOINT
  delete process.env.S3_BUCKET
  delete process.env.S3_PUBLIC_BASE_URL
})

describe('s3 storage', () => {
  it('上传成功时调用 AwsClient.fetch 并返回公开 URL', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 200 }))
    const storage = new S3Storage()
    const file = new Blob(['image'], { type: 'image/png' })

    const result = await storage.upload({ file, extension: 'png', contentType: 'image/png' })

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/s3\.example\.com\/bucket\/\d{4}-\d{2}-\d{2}\/.+\.png$/),
      expect.objectContaining({
        method: 'PUT',
        headers: { 'Content-Type': 'image/png' },
      }),
    )
    expect(result.url).toMatch(/^https:\/\/cdn\.example\.com\/\d{4}-\d{2}-\d{2}\/.+\.png$/)
  })

  it('上传失败时抛出带 provider 的 StorageError', async () => {
    fetchMock.mockResolvedValue(new Response('failed', { status: 403 }))
    const storage = new S3Storage()

    await expect(storage.upload({
      file: new Blob(['image'], { type: 'image/png' }),
      extension: 'png',
      contentType: 'image/png',
    })).rejects.toMatchObject({ provider: 's3' })
  })

  it('缺少凭证时构造失败', () => {
    delete process.env.S3_ACCESS_KEY_ID

    expect(() => new S3Storage()).toThrow(StorageError)
  })
})
