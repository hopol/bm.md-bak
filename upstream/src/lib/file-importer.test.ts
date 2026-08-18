import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useFilesStore } from '@/stores/files'

import {
  classifyFile,
  importFilesAsNewTabs,
  parseFileToMarkdown,
} from './file-importer'
import { MARKDOWN_FILE_EXTENSIONS } from './markdown-file'

const createFile = vi.fn(async (name: string) => name)

vi.mock('@/stores/files', () => ({
  useFilesStore: {
    getState: vi.fn(),
  },
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

vi.mock('@/lib/markdown/browser', () => ({
  markdown: {
    parse: vi.fn(async ({ html }: { html: string }) => ({ result: `解析:${html}` })),
  },
}))

function createTextFile(name: string, content = name, type = ''): File {
  return new File([content], name, { type })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useFilesStore.getState).mockReturnValue({ createFile } as never)
})

describe('文件分类与解析', () => {
  it('复用独立 Markdown 文件定义', () => {
    expect(MARKDOWN_FILE_EXTENSIONS).toEqual(['.md', '.markdown', '.mdown', '.mkd'])
  })

  it.each([
    '文档.md',
    '文档.markdown',
    '文档.mdown',
    '文档.mkd',
    '文档.MD',
    '文档.MarkDown',
    '文档.MDOWN',
    '文档.MkD',
  ])('将 %s 分类为 Markdown', (name) => {
    expect(classifyFile(createTextFile(name))).toBe('markdown')
  })

  it.each([
    ['页面.html', ''],
    ['页面.HTM', ''],
    ['页面', 'text/html'],
  ])('将 HTML 文件 %s 分类为 HTML', (name, type) => {
    expect(classifyFile(createTextFile(name, '', type))).toBe('html')
  })

  it('不接受伪装成 Markdown 的扩展名', () => {
    expect(classifyFile(createTextFile('文档.md.txt'))).toBe('unsupported')
  })

  it('使用同一个解析入口读取 Markdown 和转换 HTML', async () => {
    await expect(parseFileToMarkdown(createTextFile('文档.MARKDOWN', '正文'))).resolves.toEqual({
      name: '文档.MARKDOWN',
      content: '正文',
      kind: 'markdown',
    })
    await expect(parseFileToMarkdown(createTextFile('页面.HTML', '<h1>标题</h1>'))).resolves.toEqual({
      name: '页面.md',
      content: '解析:<h1>标题</h1>',
      kind: 'html',
    })
  })
})

describe('批量导入', () => {
  it('保持原始顺序，并由 createFile 激活最后创建项', async () => {
    let activeFileId: string | null = null
    createFile.mockImplementation(async (name: string) => {
      activeFileId = name
      return name
    })

    await importFilesAsNewTabs([
      createTextFile('第一.md', '一'),
      createTextFile('第二.markdown', '二'),
      createTextFile('第三.MKD', '三'),
    ])

    expect(createFile.mock.calls).toEqual([
      ['第一.md', '一'],
      ['第二.markdown', '二'],
      ['第三.MKD', '三'],
    ])
    expect(activeFileId).toBe('第三.MKD')
  })

  it('createFile reject 时不误报导入成功', async () => {
    createFile.mockRejectedValueOnce(new Error('创建失败'))

    await importFilesAsNewTabs([createTextFile('失败.md', '正文')])

    expect(toast.error).toHaveBeenCalledWith('导入失败: 失败.md')
    expect(toast.success).not.toHaveBeenCalled()
  })
})
