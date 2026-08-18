import { onError } from '@orpc/server'
import { RPCHandler } from '@orpc/server/message-port'
import { logSafeError } from '@/lib/log-safe-error'
import { workerRouter } from './router'

const handler = new RPCHandler(workerRouter, {
  interceptors: [onError(error => logSafeError('Markdown worker error', error))],
})

handler.upgrade(globalThis.self as unknown as MessagePort)
