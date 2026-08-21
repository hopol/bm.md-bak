import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useFilesStore } from '@/stores/files'
import { DocumentImportError, getDocumentImportErrorMessage } from './document/error'
import { DOCUMENT_MAX_FILE_SIZE } from './document/files'

import {
  classifyFile,
  importFilesAsNewTabs,
  parseFileToMarkdown,
  partitionImportFiles,
} from './file-importer'

const createFile = vi.fn(async (name: string) => name)
const convertDocument = vi.fn(async () => '转换内容')

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

vi.mock('@/lib/document/browser', () => ({ convertDocument }))

function createTextFile(name: string, content = name, type = ''): File {
  return new File([content], name, { type })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useFilesStore.getState).mockReturnValue({ createFile } as never)
})

describe('文件分类与解析', () => {
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

  it.each([
    '文档.doc',
    '文档.docx',
    '文档.docm',
    '演示.ppt',
    '演示.pps',
    '演示.pot',
    '演示.pptx',
    '演示.pptm',
    '演示.ppsx',
    '演示.ppsm',
    '表格.xls',
    '表格.xlsx',
    '表格.xlsm',
    '表格.xlsb',
    '开放.odt',
    '开放.ods',
    '开放.odp',
    '文档.rtf',
    '电子书.epub',
    '数据.csv',
    '文件.pdf',
  ])('将 %s 分类为文档', (name) => {
    expect(classifyFile(createTextFile(name))).toBe('document')
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

  it('动态转换文档并将原扩展名替换为 md', async () => {
    const file = createTextFile('季度.报告.PPTX', '二进制')

    await expect(parseFileToMarkdown(file)).resolves.toEqual({
      name: '季度.报告.md',
      content: '转换内容',
      kind: 'document',
    })
    expect(convertDocument).toHaveBeenCalledWith({
      bytes: expect.any(ArrayBuffer),
      formatHint: undefined,
    })
  })

  it('无扩展名 text/csv 文件传递 CSV hint', async () => {
    await parseFileToMarkdown(createTextFile('数据', 'a,b', 'text/csv'))

    expect(convertDocument).toHaveBeenCalledWith({
      bytes: expect.any(ArrayBuffer),
      formatHint: 'csv',
    })
  })

  it('互斥分区时图片 MIME 优先', () => {
    const image = createTextFile('伪装.docx', '', 'image/png')
    const document = createTextFile('文件.pdf')
    const unsupported = createTextFile('未知.bin')

    expect(partitionImportFiles([image, document, unsupported])).toEqual({
      nonImageFiles: [document, unsupported],
      imageFiles: [image],
    })
  })

  it('超过 20 MiB 时不读取文件内容', async () => {
    const arrayBuffer = vi.fn()
    const file = {
      name: '超大.pdf',
      type: 'application/pdf',
      size: DOCUMENT_MAX_FILE_SIZE + 1,
      arrayBuffer,
    } as unknown as File

    await expect(parseFileToMarkdown(file)).rejects.toMatchObject({ code: 'tooLarge' })
    expect(arrayBuffer).not.toHaveBeenCalled()
    expect(convertDocument).not.toHaveBeenCalled()
  })

  it.each([
    ['unsupported', '不支持该文件或扫描版 PDF: 文件.pdf'],
    ['malformed', '文件损坏，无法导入: 文件.pdf'],
    ['encrypted', '文件已加密，无法导入: 文件.pdf'],
    ['resourceLimit', '文件过于复杂，无法导入: 文件.pdf'],
    ['missingPart', '文件内容不完整: 文件.pdf'],
    ['runtime', '文档转换失败，请重试: 文件.pdf'],
    ['tooLarge', '文件超过 20 MiB: 文件.pdf'],
  ] as const)('映射 %s 错误为安全用户提示', (code, message) => {
    expect(getDocumentImportErrorMessage('文件.pdf', new DocumentImportError(code))).toBe(message)
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

  it('文档解析与创建均按输入顺序串行执行', async () => {
    let finishFirst: ((markdown: string) => void) | undefined
    convertDocument
      .mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve }))
      .mockResolvedValueOnce('第二份')

    const importing = importFilesAsNewTabs([
      createTextFile('第一.pdf', '一'),
      createTextFile('第二.docx', '二'),
    ])
    await vi.waitFor(() => expect(convertDocument).toHaveBeenCalledTimes(1))
    expect(createFile).not.toHaveBeenCalled()

    finishFirst?.('第一份')
    await importing

    expect(convertDocument).toHaveBeenCalledTimes(2)
    expect(createFile.mock.calls).toEqual([
      ['第一.md', '第一份'],
      ['第二.md', '第二份'],
    ])
  })

  it('不支持的文件会明确提示而不是静默跳过', async () => {
    await importFilesAsNewTabs([createTextFile('未知.bin')])

    expect(toast.error).toHaveBeenCalledWith('不支持的文件: 未知.bin')
    expect(createFile).not.toHaveBeenCalled()
  })

  it('文档转换错误显示对应提示', async () => {
    convertDocument.mockRejectedValueOnce(new DocumentImportError('encrypted'))

    await importFilesAsNewTabs([createTextFile('加密.pdf')])

    expect(toast.error).toHaveBeenCalledWith('文件已加密，无法导入: 加密.pdf')
  })
})
