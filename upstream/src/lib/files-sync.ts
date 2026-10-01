// 跨标签同步通道：只广播“有变更”，不带 payload，接收方自行回读存储。
const CHANNEL_NAME = 'bm.md.files'

let channel: BroadcastChannel | null | undefined

function getChannel(): BroadcastChannel | null {
  if (channel === undefined) {
    try {
      channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(CHANNEL_NAME) : null
      // Node.js 的 BroadcastChannel 持引用计数会阻止进程退出。
      ;(channel as unknown as { unref?: () => void } | null)?.unref?.()
    }
    catch {
      channel = null
    }
  }
  return channel
}

export function notifyFilesChanged(): void {
  try {
    getChannel()?.postMessage(null)
  }
  catch {
    // 通知失败不影响当前标签继续工作。
  }
}

export function onFilesChanged(listener: () => void): () => void {
  const current = getChannel()
  if (!current) {
    return () => {}
  }
  current.addEventListener('message', listener)
  return () => {
    current.removeEventListener('message', listener)
  }
}
