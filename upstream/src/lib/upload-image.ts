import { $fetch } from 'ofetch'
import * as z from 'zod'

import { env } from '@/env'

const uploadImageResponseSchema = z.object({
  url: z.string().min(1),
})

export type UploadImageResponse = z.infer<typeof uploadImageResponseSchema>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function getUploadErrorMessage(error: unknown): string {
  if (isRecord(error) && isRecord(error.data) && typeof error.data.error === 'string') {
    return error.data.error
  }

  return error instanceof Error && error.message
    ? error.message
    : '图片上传失败'
}

function getUploadUrl(): string {
  const baseUrl = env.VITE_API_URL?.replace(/\/+$/, '') ?? ''
  return `${baseUrl}/api/upload/image`
}

export async function uploadImage(formData: FormData): Promise<UploadImageResponse> {
  let response: unknown
  try {
    response = await $fetch(getUploadUrl(), {
      method: 'POST',
      body: formData,
    })
  }
  catch (error) {
    throw new Error(getUploadErrorMessage(error))
  }

  const parsed = uploadImageResponseSchema.safeParse(response)
  if (!parsed.success) {
    throw new Error('图片上传响应格式错误')
  }

  return parsed.data
}
