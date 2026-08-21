import type { DocumentWorkerRequest, DocumentWorkerResponse } from './protocol'
import init, { toMarkdownBytes } from '@firecrawl/anydoc-wasm'
import { isDocumentErrorCode } from './protocol'

export async function convertWithAnyDoc(input: DocumentWorkerRequest): Promise<DocumentWorkerResponse> {
  try {
    await init()
  }
  catch {
    return { success: false, code: 'runtime' }
  }

  try {
    return {
      success: true,
      markdown: toMarkdownBytes(new Uint8Array(input.bytes), input.formatHint),
    }
  }
  catch (error) {
    const code = error instanceof Error && 'code' in error ? error.code : undefined
    return { success: false, code: isDocumentErrorCode(code) ? code : 'runtime' }
  }
}
