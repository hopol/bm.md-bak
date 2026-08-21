import type { Format } from '@firecrawl/anydoc-wasm'

export const DOCUMENT_MAX_FILE_SIZE = 20 * 1024 * 1024
export const DOCUMENT_MAX_FILE_SIZE_MIB = DOCUMENT_MAX_FILE_SIZE / 1024 / 1024

export const DOCUMENT_MIME_EXTENSIONS = {
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.ms-word.document.macroEnabled.12': ['.docm'],
  'application/vnd.ms-powerpoint': ['.ppt', '.pps', '.pot'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
  'application/vnd.ms-powerpoint.presentation.macroEnabled.12': ['.pptm'],
  'application/vnd.openxmlformats-officedocument.presentationml.slideshow': ['.ppsx'],
  'application/vnd.ms-powerpoint.slideshow.macroEnabled.12': ['.ppsm'],
  'application/vnd.ms-excel': ['.xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.ms-excel.sheet.macroEnabled.12': ['.xlsm'],
  'application/vnd.ms-excel.sheet.binary.macroEnabled.12': ['.xlsb'],
  'application/vnd.oasis.opendocument.text': ['.odt'],
  'application/vnd.oasis.opendocument.spreadsheet': ['.ods'],
  'application/vnd.oasis.opendocument.presentation': ['.odp'],
  'application/rtf': ['.rtf'],
  'application/epub+zip': ['.epub'],
  'text/csv': ['.csv'],
  'application/pdf': ['.pdf'],
} satisfies Record<string, string[]>

export const DOCUMENT_FILE_EXTENSIONS = Object.values(DOCUMENT_MIME_EXTENSIONS).flat()

export const DOCUMENT_FILE_ACCEPT = [
  ...Object.keys(DOCUMENT_MIME_EXTENSIONS),
  ...DOCUMENT_FILE_EXTENSIONS,
].join(',')

const DOCUMENT_EXTENSION_SET = new Set<string>(DOCUMENT_FILE_EXTENSIONS)
const DOCUMENT_MIME_SET = new Set<string>(Object.keys(DOCUMENT_MIME_EXTENSIONS))

function getExtension(name: string): string {
  return name.match(/\.[^.]+$/)?.[0].toLowerCase() ?? ''
}

export function isDocumentFile(file: Pick<File, 'name' | 'type'>): boolean {
  return DOCUMENT_EXTENSION_SET.has(getExtension(file.name)) || DOCUMENT_MIME_SET.has(file.type)
}

export function getDocumentFormatHint(file: Pick<File, 'name' | 'type'>): Format | undefined {
  return getExtension(file.name) === '.csv' || file.type === 'text/csv' ? 'csv' : undefined
}
