import { afterEach, describe, expect, it } from 'vitest'

import { DCStorage, getStorageProvider, isS3Configured, S3Storage } from './index'

const s3Keys = ['S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_ENDPOINT'] as const

afterEach(() => {
  for (const key of s3Keys) {
    delete process.env[key]
  }
})

describe('storage provider selection', () => {
  it('s3 配置不完整时使用 DC 存储', () => {
    process.env.S3_ACCESS_KEY_ID = 'key'
    process.env.S3_SECRET_ACCESS_KEY = 'secret'

    expect(isS3Configured()).toBe(false)
    expect(getStorageProvider()).toBeInstanceOf(DCStorage)
  })

  it('s3 必填配置齐全时使用 S3 存储', () => {
    process.env.S3_ACCESS_KEY_ID = 'key'
    process.env.S3_SECRET_ACCESS_KEY = 'secret'
    process.env.S3_ENDPOINT = 'https://s3.example.com'

    expect(isS3Configured()).toBe(true)
    expect(getStorageProvider()).toBeInstanceOf(S3Storage)
  })
})
