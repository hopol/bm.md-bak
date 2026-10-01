import { saveFile } from '@/lib/file-storage'

interface Writer {
  forceFlush: boolean
  latest: string | null
  promise: Promise<void>
  releaseTail: (() => void) | null
  tailTimer: ReturnType<typeof setTimeout> | null
}

interface WriterCallbacks {
  onSaveResult: (id: string, version: number | false) => void
  onFailure: (error: unknown) => void
}

const SAVE_TAIL_MS = 150

export type FileWriters = ReturnType<typeof createFileWriters>

export function createFileWriters({ onSaveResult, onFailure }: WriterCallbacks) {
  const writers = new Map<string, Writer>()
  const failedDrafts = new Map<string, string>()
  const flushPromises = new Map<string, Promise<boolean>>()
  // 同一文件的连续失败只向用户告警一次，保存成功后解除。
  const warned = new Set<string>()

  function reportFailure(error: unknown, id: string): void {
    if (warned.has(id)) {
      return
    }
    warned.add(id)
    onFailure(error)
  }

  // 保存成功后留 150ms 尾随窗口合并后续编辑；flush 通过 releaseTail 提前放行。
  function waitForTail(writer: Writer): Promise<void> {
    if (writer.forceFlush) {
      return Promise.resolve()
    }
    return new Promise((resolve) => {
      writer.releaseTail = () => {
        if (writer.tailTimer !== null) {
          clearTimeout(writer.tailTimer)
          writer.tailTimer = null
        }
        writer.releaseTail = null
        resolve()
      }
      writer.tailTimer = setTimeout(writer.releaseTail, SAVE_TAIL_MS)
    })
  }

  function start(id: string, content: string): Writer {
    failedDrafts.set(id, content)
    const existing = writers.get(id)
    if (existing) {
      existing.latest = content
      return existing
    }

    const writer: Writer = {
      forceFlush: false,
      latest: null,
      promise: Promise.resolve(),
      releaseTail: null,
      tailTimer: null,
    }
    writer.promise = (async () => {
      let next: string | null = content
      while (next !== null) {
        const saving = next
        next = null
        try {
          const version = await saveFile(id, saving)
          warned.delete(id)
          onSaveResult(id, version)
          // false 表示文件已被删除，草稿无落点直接丢弃。
          if (version === false) {
            failedDrafts.delete(id)
            writer.latest = null
            return
          }
          if (failedDrafts.get(id) === saving) {
            failedDrafts.delete(id)
          }
          await waitForTail(writer)
        }
        catch (error) {
          reportFailure(error, id)
          failedDrafts.set(id, writer.latest ?? saving)
          writer.latest = null
          return
        }
        next = writer.latest
        writer.latest = null
      }
    })().finally(() => {
      writer.releaseTail?.()
      writers.delete(id)
    })
    writers.set(id, writer)
    return writer
  }

  function flushFile(id: string | null): Promise<boolean> {
    if (!id) {
      return Promise.resolve(true)
    }
    const existing = flushPromises.get(id)
    if (existing) {
      return existing
    }

    const flushing = (async () => {
      const running = writers.get(id)
      if (running) {
        running.forceFlush = true
        running.releaseTail?.()
        await running.promise
      }
      const draft = failedDrafts.get(id)
      if (draft === undefined) {
        return true
      }
      const retry = start(id, draft)
      retry.forceFlush = true
      retry.releaseTail?.()
      await retry.promise
      return !failedDrafts.has(id)
    })().finally(() => {
      flushPromises.delete(id)
    })
    flushPromises.set(id, flushing)
    return flushing
  }

  async function flushFiles(ids: Array<string | null>): Promise<boolean> {
    for (const id of new Set(ids)) {
      if (!await flushFile(id)) {
        return false
      }
    }
    return true
  }

  async function flushAll(): Promise<boolean> {
    const ids = new Set([...writers.keys(), ...failedDrafts.keys()])
    const results = await Promise.all([...ids].map(id => flushFile(id)))
    return results.every(Boolean)
  }

  return {
    save: (id: string, content: string): void => { start(id, content) },
    hasPending: (id: string): boolean => writers.has(id) || failedDrafts.has(id),
    flushFile,
    flushFiles,
    flushAll,
  }
}
