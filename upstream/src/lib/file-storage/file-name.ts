import type { MarkdownFile } from './types'
import { getMarkdownFileExtension } from '@/lib/markdown-file'

const DEFAULT_FILE_NAME = 'bm.md'

// 空白名称回落到默认文件名，缺少 Markdown 扩展名时补 `.md`。
function normalizeFileName(name: string): string {
  const trimmed = name.trim() || DEFAULT_FILE_NAME
  return getMarkdownFileExtension(trimmed) ? trimmed : `${trimmed}.md`
}

// 大小写不敏感去重，冲突时在主名后追加 ` (n)` 序号。
export function uniqueFileName(name: string, files: MarkdownFile[], excludeId?: string): string {
  const normalized = normalizeFileName(name)
  const extension = getMarkdownFileExtension(normalized) ?? '.md'
  const baseName = normalized.slice(0, -extension.length)
  const names = new Set<string>()
  for (const file of files) {
    if (file.id !== excludeId) {
      names.add(file.name.toLocaleLowerCase())
    }
  }
  if (!names.has(normalized.toLocaleLowerCase())) {
    return normalized
  }

  let suffix = 1
  while (names.has(`${baseName} (${suffix})${extension}`.toLocaleLowerCase())) {
    suffix++
  }
  return `${baseName} (${suffix})${extension}`
}
