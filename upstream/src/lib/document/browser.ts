import type { DocumentWorkerRequest, DocumentWorkerResponse } from './protocol'
import { DocumentImportError } from './error'
import { isDocumentErrorCode } from './protocol'

const CONVERSION_TIMEOUT_MS = 120_000

let workerPromise: Promise<Worker> | null = null
let queue: Promise<void> = Promise.resolve()

function resetWorker(worker?: Worker): void {
  if (worker) {
    worker.terminate()
  }
  workerPromise = null
}

function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = import('./worker?worker')
      .then(({ default: DocumentWorker }) => new DocumentWorker())
      .catch((error) => {
        resetWorker()
        throw error
      })
  }
  return workerPromise
}

async function runConversion(input: DocumentWorkerRequest): Promise<string> {
  let worker: Worker
  try {
    worker = await getWorker()
  }
  catch {
    throw new DocumentImportError('runtime')
  }

  return new Promise((resolve, reject) => {
    let timeoutId: ReturnType<typeof setTimeout>

    function cleanup() {
      clearTimeout(timeoutId)
      worker.removeEventListener('message', handleMessage)
      worker.removeEventListener('error', handleWorkerFailure)
      worker.removeEventListener('messageerror', handleWorkerFailure)
    }

    function failRuntime() {
      cleanup()
      resetWorker(worker)
      reject(new DocumentImportError('runtime'))
    }

    function handleMessage(event: MessageEvent<DocumentWorkerResponse>) {
      const response = event.data
      cleanup()
      if (response.success) {
        resolve(response.markdown)
        return
      }
      if (response.code === 'runtime') {
        resetWorker(worker)
      }
      else if (!isDocumentErrorCode(response.code)) {
        resetWorker(worker)
        reject(new DocumentImportError('runtime'))
        return
      }
      reject(new DocumentImportError(response.code))
    }

    function handleWorkerFailure() {
      failRuntime()
    }

    timeoutId = setTimeout(failRuntime, CONVERSION_TIMEOUT_MS)
    worker.addEventListener('message', handleMessage)
    worker.addEventListener('error', handleWorkerFailure)
    worker.addEventListener('messageerror', handleWorkerFailure)
    try {
      worker.postMessage(input, [input.bytes])
    }
    catch {
      failRuntime()
    }
  })
}

export function convertDocument(input: DocumentWorkerRequest): Promise<string> {
  const conversion = queue.then(() => runConversion(input))
  queue = conversion.then(() => undefined, () => undefined)
  return conversion
}
