import type { DocumentWorkerRequest } from './protocol'
import { convertWithAnyDoc } from './anydoc'

globalThis.onmessage = async (event: MessageEvent<DocumentWorkerRequest>) => {
  const response = await convertWithAnyDoc(event.data)
  globalThis.postMessage(response)
}
