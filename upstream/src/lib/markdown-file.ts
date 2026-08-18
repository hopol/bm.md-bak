export const MARKDOWN_FILE_EXTENSIONS = ['.md', '.markdown', '.mdown', '.mkd'] as const
export const MARKDOWN_FILE_ACCEPT = MARKDOWN_FILE_EXTENSIONS.join(',')

const markdownFileExtensions = new Set<string>(MARKDOWN_FILE_EXTENSIONS)

export function getMarkdownFileExtension(name: string): string | null {
  const extension = name.match(/\.[^.]+$/)?.[0]
  if (!extension || !markdownFileExtensions.has(extension.toLowerCase())) {
    return null
  }
  return extension
}

export function isMarkdownFileName(name: string): boolean {
  return getMarkdownFileExtension(name) !== null
}
