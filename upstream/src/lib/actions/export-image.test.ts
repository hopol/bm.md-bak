import { beforeEach, describe, expect, it, vi } from 'vitest'
import { copyImage, exportImage } from './export-image'

const mocks = vi.hoisted(() => ({
  copyImage: vi.fn(),
  error: vi.fn(),
  getPreviewElement: vi.fn(),
  download: vi.fn(),
  snapdom: vi.fn(),
  success: vi.fn(),
  toBlob: vi.fn(),
}))

vi.mock('@/lib/clipboard', () => ({ copyImage: mocks.copyImage }))
vi.mock('./preview', () => ({ getPreviewElement: mocks.getPreviewElement }))
vi.mock('sonner', () => ({ toast: { error: mocks.error, success: mocks.success } }))
vi.mock('@zumer/snapdom', () => ({
  snapdom: mocks.snapdom,
}))

describe('图片导出', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getPreviewElement.mockReturnValue({
      getBoundingClientRect: () => ({ width: 600, height: 400 }),
    })
    mocks.snapdom.mockResolvedValue({
      download: mocks.download,
      toBlob: mocks.toBlob,
    })
    mocks.toBlob.mockResolvedValue(new Blob(['image'], { type: 'image/png' }))
  })

  it('使用安全尺寸和固定 DPR 创建快照', async () => {
    mocks.copyImage.mockResolvedValue(true)

    await copyImage()

    expect(mocks.snapdom).toHaveBeenCalledWith(
      mocks.getPreviewElement.mock.results[0].value,
      { dpr: 1, width: 1200, height: 800 },
    )
  })

  it('下载时显式指定 JPEG 格式和质量', async () => {
    await exportImage()

    expect(mocks.download).toHaveBeenCalledWith({
      filename: 'bm.md.jpg',
      format: 'jpeg',
      quality: 0.99,
    })
    expect(mocks.success).toHaveBeenCalledWith('已导出图片')
  })

  it('复制时以固定 DPR 生成 PNG', async () => {
    mocks.copyImage.mockResolvedValue(true)

    await copyImage()

    expect(mocks.toBlob).toHaveBeenCalledWith({ dpr: 1, type: 'png' })
  })

  it('剪贴板写入成功时提示成功', async () => {
    mocks.copyImage.mockResolvedValue(true)

    await copyImage()

    expect(mocks.success).toHaveBeenCalledWith('已复制图片到剪贴板')
    expect(mocks.error).not.toHaveBeenCalled()
  })

  it('剪贴板写入返回 false 时只提示失败', async () => {
    mocks.copyImage.mockResolvedValue(false)

    await copyImage()

    expect(mocks.error).toHaveBeenCalledWith('复制图片失败')
    expect(mocks.success).not.toHaveBeenCalled()
  })
})
