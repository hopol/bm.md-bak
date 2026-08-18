import { createFileRoute } from '@tanstack/react-router'
import * as z from 'zod'
import { corsMiddleware } from '@/lib/middleware/cors'
import { getStorageProvider, StorageError } from '@/storage'

const MAX_IMAGE_SIZE_MB = 5
const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024
export const MAX_MULTIPART_REQUEST_SIZE_BYTES = 6 * 1024 * 1024

const uploadSchema = z.object({
  name: z.string().min(1),
  file: z.instanceof(Blob),
})

export interface DetectedImageFormat {
  extension: 'gif' | 'jpg' | 'png' | 'webp'
  contentType: 'image/gif' | 'image/jpeg' | 'image/png' | 'image/webp'
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((byte, index) => bytes[index] === byte)
}

export async function detectImageFormat(imageFile: Blob): Promise<DetectedImageFormat | null> {
  const bytes = new Uint8Array(await imageFile.slice(0, 12).arrayBuffer())

  if (startsWith(bytes, [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])) {
    return { extension: 'png', contentType: 'image/png' }
  }

  if (startsWith(bytes, [0xFF, 0xD8, 0xFF])) {
    return { extension: 'jpg', contentType: 'image/jpeg' }
  }

  const header = new TextDecoder().decode(bytes)
  if (header.startsWith('GIF87a') || header.startsWith('GIF89a')) {
    return { extension: 'gif', contentType: 'image/gif' }
  }

  if (header.startsWith('RIFF') && header.slice(8, 12) === 'WEBP') {
    return { extension: 'webp', contentType: 'image/webp' }
  }

  return null
}

export function validateImageFile(imageFile: Blob): string | null {
  if (imageFile.size > MAX_IMAGE_SIZE_BYTES) {
    return `图片大小不能超过 ${MAX_IMAGE_SIZE_MB}MB`
  }

  return null
}

export function isMultipartRequestTooLarge(contentLength: string | null): boolean {
  if (contentLength === null) {
    return false
  }

  const normalizedContentLength = contentLength.trim()
  if (!/^\d+$/.test(normalizedContentLength)) {
    return false
  }

  return BigInt(normalizedContentLength) > BigInt(MAX_MULTIPART_REQUEST_SIZE_BYTES)
}

export const Route = createFileRoute('/api/upload/image')({
  server: {
    middleware: [corsMiddleware],
    handlers: {
      POST: async ({ request }) => {
        if (isMultipartRequestTooLarge(request.headers.get('content-length'))) {
          return Response.json(
            { error: '上传内容过大' },
            { status: 413 },
          )
        }

        try {
          const formData = await request.formData()
          const file = formData.get('file')
          const name = formData.get('name')

          const parsed = uploadSchema.parse({ file, name })
          const { file: imageFile } = parsed

          const validationError = validateImageFile(imageFile)
          if (validationError) {
            return Response.json(
              { error: validationError },
              { status: 400 },
            )
          }

          const format = await detectImageFormat(imageFile)
          if (!format) {
            return Response.json(
              { error: '只支持 PNG、JPEG、GIF、WebP 图片' },
              { status: 400 },
            )
          }

          const normalizedFile = new Blob(
            [await imageFile.arrayBuffer()],
            { type: format.contentType },
          )

          const storage = getStorageProvider()
          const result = await storage.upload({
            file: normalizedFile,
            extension: format.extension,
            contentType: format.contentType,
          })

          return Response.json({ url: result.url })
        }
        catch (error) {
          if (error instanceof z.ZodError) {
            return Response.json(
              { error: '请求参数错误' },
              { status: 400 },
            )
          }

          if (error instanceof StorageError) {
            console.error(`Upload error [${error.provider}]:`, error.message, error.cause)
            return Response.json(
              { error: '图片上传到存储失败' },
              { status: 500 },
            )
          }

          console.error('Upload error:', error)

          return Response.json(
            { error: '图片上传失败，请稍后重试' },
            { status: 500 },
          )
        }
      },
    },
  },
})
