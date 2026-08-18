import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  detectImageFormat,
  isMultipartRequestTooLarge,
  MAX_MULTIPART_REQUEST_SIZE_BYTES,
  Route,
  validateImageFile,
} from './api.upload.image'

const storageMock = vi.hoisted(() => {
  class MockStorageError extends Error {
    provider: string

    constructor(provider: string, message: string, options?: ErrorOptions) {
      super(message, options)
      this.name = 'StorageError'
      this.provider = provider
    }
  }

  return {
    getStorageProvider: vi.fn(),
    upload: vi.fn(),
    StorageError: MockStorageError,
  }
})

vi.mock('@/storage', () => ({
  getStorageProvider: storageMock.getStorageProvider,
  StorageError: storageMock.StorageError,
}))

interface UploadHandlerContext {
  request: Request
}

type UploadPostHandler = (context: UploadHandlerContext) => Promise<Response>

function getPostHandler(): UploadPostHandler {
  const route = Route as unknown as {
    options: {
      server: {
        handlers: {
          POST: UploadPostHandler
        }
      }
    }
  }

  return route.options.server.handlers.POST
}

function createUploadRequest(formData: FormData, contentLength?: string) {
  return new Request('http://localhost/api/upload/image', {
    method: 'POST',
    body: formData,
    headers: contentLength === undefined ? undefined : { 'content-length': contentLength },
  })
}

function createImageFile() {
  return new File([
    new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
  ], 'image.png', { type: 'image/png' })
}

afterEach(() => {
  vi.restoreAllMocks()
  storageMock.getStorageProvider.mockReset()
  storageMock.upload.mockReset()
})

describe('upload image validation', () => {
  it.each([
    [null, false],
    ['invalid', false],
    [`${MAX_MULTIPART_REQUEST_SIZE_BYTES}`, false],
    [`${MAX_MULTIPART_REQUEST_SIZE_BYTES + 1}`, true],
    ['999999999999999999999999999999', true],
  ])('根据合法 Content-Length 判断请求是否过大：%s', (contentLength, expected) => {
    expect(isMultipartRequestTooLarge(contentLength)).toBe(expected)
  })

  it('拒绝超过 5MB 的图片', () => {
    const file = new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: 'image/png' })

    expect(validateImageFile(file)).toBe('图片大小不能超过 5MB')
  })

  it('文件大小合法时通过初步校验，不依赖客户端 MIME', () => {
    const file = new Blob(['image'], { type: 'text/plain' })

    expect(validateImageFile(file)).toBeNull()
  })

  it.each([
    ['PNG', [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], { extension: 'png', contentType: 'image/png' }],
    ['JPEG', [0xFF, 0xD8, 0xFF, 0xE0], { extension: 'jpg', contentType: 'image/jpeg' }],
    ['GIF', [...new TextEncoder().encode('GIF89a')], { extension: 'gif', contentType: 'image/gif' }],
    ['WebP', [...new TextEncoder().encode('RIFF0000WEBP')], { extension: 'webp', contentType: 'image/webp' }],
  ])('根据文件签名识别 %s', async (_name, bytes, expected) => {
    const file = new Blob([new Uint8Array(bytes)], { type: 'application/octet-stream' })

    await expect(detectImageFormat(file)).resolves.toEqual(expected)
  })

  it.each([
    ['伪造 image MIME', new Blob(['not an image'], { type: 'image/png' })],
    ['SVG', new Blob(['<svg xmlns="http://www.w3.org/2000/svg"></svg>'], { type: 'image/svg+xml' })],
  ])('拒绝%s', async (_name, file) => {
    await expect(detectImageFormat(file)).resolves.toBeNull()
  })
})

describe('upload image route', () => {
  it('content-length 超限时在解析 multipart 前返回 413', async () => {
    const request = createUploadRequest(
      new FormData(),
      `${MAX_MULTIPART_REQUEST_SIZE_BYTES + 1}`,
    )
    const formDataSpy = vi.spyOn(request, 'formData')

    const response = await getPostHandler()({ request })
    const data = await response.json() as { error?: string }

    expect(response.status).toBe(413)
    expect(data).toEqual({ error: '上传内容过大' })
    expect(formDataSpy).not.toHaveBeenCalled()
    expect(storageMock.getStorageProvider).not.toHaveBeenCalled()
  })

  it('非法 Content-Length 继续由图片大小校验兜底', async () => {
    const formData = new FormData()
    formData.set('file', new File(
      [new Uint8Array(5 * 1024 * 1024 + 1)],
      'image.png',
      { type: 'image/png' },
    ))
    formData.set('name', 'image.png')

    const response = await getPostHandler()({
      request: createUploadRequest(formData, 'invalid'),
    })
    const data = await response.json() as { error?: string }

    expect(response.status).toBe(400)
    expect(data).toEqual({ error: '图片大小不能超过 5MB' })
    expect(storageMock.getStorageProvider).not.toHaveBeenCalled()
  })

  it('按文件签名规范化扩展名和 Content-Type 后上传', async () => {
    const imageFile = new File([
      new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0]),
    ], 'forged.png', { type: 'image/png' })
    const formData = new FormData()
    formData.set('file', imageFile)
    formData.set('name', 'forged.png')
    storageMock.upload.mockResolvedValue({ url: 'https://cdn.example.com/image.jpg' })
    storageMock.getStorageProvider.mockReturnValue({ upload: storageMock.upload })

    const response = await getPostHandler()({ request: createUploadRequest(formData) })
    const data = await response.json() as { url?: string }

    expect(response.status).toBe(200)
    expect(data).toEqual({ url: 'https://cdn.example.com/image.jpg' })
    expect(storageMock.getStorageProvider).toHaveBeenCalledOnce()
    expect(storageMock.upload).toHaveBeenCalledWith(expect.objectContaining({
      extension: 'jpg',
      contentType: 'image/jpeg',
    }))
    const uploadedFile = storageMock.upload.mock.calls[0]?.[0].file as Blob
    expect(uploadedFile.type).toBe('image/jpeg')
    expect(new Uint8Array(await uploadedFile.arrayBuffer())).toEqual(new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0]))
  })

  it.each([
    ['伪造图片 MIME', new File(['plain text'], 'fake.png', { type: 'image/png' })],
    ['SVG', new File(['<svg></svg>'], 'image.svg', { type: 'image/svg+xml' })],
  ])('%s 返回 400 且不调用存储', async (_label, file) => {
    const formData = new FormData()
    formData.set('file', file)
    formData.set('name', file.name)

    const response = await getPostHandler()({ request: createUploadRequest(formData) })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: '只支持 PNG、JPEG、GIF、WebP 图片' })
    expect(storageMock.getStorageProvider).not.toHaveBeenCalled()
  })

  it.each([
    ['缺少文件', 'name'],
    ['缺少文件名', 'file'],
  ])('%s 时返回请求参数错误', async (_label, onlyField) => {
    const formData = new FormData()
    if (onlyField === 'file') {
      formData.set('file', createImageFile())
    }
    else {
      formData.set('name', 'image.png')
    }

    const response = await getPostHandler()({ request: createUploadRequest(formData) })
    const data = await response.json() as { error?: string }

    expect(response.status).toBe(400)
    expect(data).toEqual({ error: '请求参数错误' })
    expect(storageMock.getStorageProvider).not.toHaveBeenCalled()
  })

  it('存储错误返回通用失败信息且不泄露细节', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const formData = new FormData()
    formData.set('file', createImageFile())
    formData.set('name', 'image.png')
    storageMock.upload.mockRejectedValue(new storageMock.StorageError('test', 'private detail'))
    storageMock.getStorageProvider.mockReturnValue({ upload: storageMock.upload })

    const response = await getPostHandler()({ request: createUploadRequest(formData) })
    const data = await response.json() as { error?: string }

    expect(response.status).toBe(500)
    expect(data).toEqual({ error: '图片上传到存储失败' })
    expect(JSON.stringify(data)).not.toContain('private detail')
    expect(consoleError).toHaveBeenCalledOnce()
  })

  it('未知异常返回通用失败信息且不泄露细节', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const formData = new FormData()
    formData.set('file', createImageFile())
    formData.set('name', 'image.png')
    storageMock.upload.mockRejectedValue(new Error('private detail'))
    storageMock.getStorageProvider.mockReturnValue({ upload: storageMock.upload })

    const response = await getPostHandler()({ request: createUploadRequest(formData) })
    const data = await response.json() as { error?: string }

    expect(response.status).toBe(500)
    expect(data).toEqual({ error: '图片上传失败，请稍后重试' })
    expect(JSON.stringify(data)).not.toContain('private detail')
    expect(consoleError).toHaveBeenCalledOnce()
  })
})
