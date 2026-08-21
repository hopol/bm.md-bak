import type { EditorView } from '@codemirror/view'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { importFilesToEditor } from './import-files'

const mocks = vi.hoisted(() => ({
  parseFileToMarkdown: vi.fn(),
  uploadImage: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    loading: vi.fn(() => 'toast'),
    success: vi.fn(),
  },
}))

vi.mock('@/lib/file-importer', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/file-importer')>()
  return { ...original, parseFileToMarkdown: mocks.parseFileToMarkdown }
})

vi.mock('@/lib/upload-image', () => ({ uploadImage: mocks.uploadImage }))

function file(name: string, type = ''): File {
  return new File(['内容'], name, { type })
}

function createView(initial = ''): { view: EditorView, content: () => string } {
  let content = initial
  const view = {
    dispatch: ({ changes }: { changes: { from: number, insert: string } }) => {
      content = `${content.slice(0, changes.from)}${changes.insert}${content.slice(changes.from)}`
    },
  } as unknown as EditorView
  return { view, content: () => content }
}

beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.restoreAllMocks())

describe('编辑器文件插入', () => {
  it('用两个换行分隔连续文档', async () => {
    mocks.parseFileToMarkdown
      .mockResolvedValueOnce({ content: '正文', kind: 'document' })
      .mockResolvedValueOnce({ content: '# 标题', kind: 'document' })
    const { view, content } = createView()

    await importFilesToEditor(view, [file('一.pdf'), file('二.docx')], 0)
    expect(content()).toBe('正文\n\n# 标题')
  })

  it('连续文档只补足到两个换行', async () => {
    mocks.parseFileToMarkdown
      .mockResolvedValueOnce({ content: '一\n\n', kind: 'document' })
      .mockResolvedValueOnce({ content: '二\n', kind: 'document' })
      .mockResolvedValueOnce({ content: '三', kind: 'document' })
    const { view, content } = createView()

    await importFilesToEditor(view, [file('一.pdf'), file('二.pdf'), file('三.pdf')], 0)
    expect(content()).toBe('一\n\n二\n\n三')
  })

  it('首项失败后第二项仍从原位置插入', async () => {
    mocks.parseFileToMarkdown
      .mockRejectedValueOnce(new Error('失败'))
      .mockResolvedValueOnce({ content: '第二份', kind: 'document' })
    const { view, content } = createView('AB')
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await importFilesToEditor(view, [file('失败.pdf'), file('成功.pdf')], 1)
    expect(content()).toBe('A第二份B')
  })

  it('按输入顺序插入文档、图片和文档', async () => {
    mocks.parseFileToMarkdown
      .mockResolvedValueOnce({ content: '一', kind: 'document' })
      .mockResolvedValueOnce({ content: '二', kind: 'document' })
    mocks.uploadImage.mockResolvedValue({ url: '/image.png' })
    const { view, content } = createView()

    await importFilesToEditor(view, [file('一.pdf'), file('图.png', 'image/png'), file('二.pdf')], 0)
    expect(content()).toBe('一\n\n![图.png](/image.png)\n\n二')
  })

  it('图片 MIME 优先，不调用文档转换', async () => {
    mocks.uploadImage.mockResolvedValue({ url: '/image.png' })
    const { view, content } = createView()

    await importFilesToEditor(view, [file('伪装.docx', 'image/png')], 0)

    expect(mocks.parseFileToMarkdown).not.toHaveBeenCalled()
    expect(mocks.uploadImage).toHaveBeenCalledOnce()
    expect(content()).toBe('![伪装.docx](/image.png)\n\n')
  })
})
