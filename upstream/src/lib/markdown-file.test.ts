import { describe, expect, it } from 'vitest'

import {
  getMarkdownFileExtension,
  isMarkdownFileName,
  MARKDOWN_FILE_ACCEPT,
  MARKDOWN_FILE_EXTENSIONS,
} from './markdown-file'

describe('markdown 文件定义', () => {
  it('集中定义四种文件扩展名和文件选择 accept', () => {
    expect(MARKDOWN_FILE_EXTENSIONS).toEqual(['.md', '.markdown', '.mdown', '.mkd'])
    expect(MARKDOWN_FILE_ACCEPT).toBe('.md,.markdown,.mdown,.mkd')
  })

  it.each([
    ['文档.md', '.md'],
    ['文档.MARKDOWN', '.MARKDOWN'],
    ['文档.mDown', '.mDown'],
    ['文档.MKD', '.MKD'],
  ])('识别 %s 并保留原扩展名', (name, extension) => {
    expect(getMarkdownFileExtension(name)).toBe(extension)
    expect(isMarkdownFileName(name)).toBe(true)
  })

  it('拒绝非末尾扩展名和不支持的扩展名', () => {
    expect(getMarkdownFileExtension('文档.md.txt')).toBeNull()
    expect(isMarkdownFileName('文档.txt')).toBe(false)
  })
})
