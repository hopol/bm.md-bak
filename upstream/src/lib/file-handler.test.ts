import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { initFileHandler } from './file-handler'

const { importFilesAsNewTabs } = vi.hoisted(() => ({
  importFilesAsNewTabs: vi.fn(async (_files: File[]) => {}),
}))

vi.mock('@/lib/file-importer', () => ({
  importFilesAsNewTabs,
}))

function createFile(name: string, content: string): File {
  return { name, content } as unknown as File
}

function createFileHandle(name: string, getFile: () => Promise<File>): FileSystemFileHandle {
  return { kind: 'file', name, getFile } as FileSystemFileHandle
}

function setupConsumer(): (params: LaunchParams) => void | Promise<void> {
  let consumer: ((params: LaunchParams) => void | Promise<void>) | undefined
  vi.stubGlobal('window', {
    launchQueue: {
      setConsumer: (nextConsumer: (params: LaunchParams) => void | Promise<void>) => {
        consumer = nextConsumer
      },
    },
  })

  initFileHandler()
  if (!consumer)
    throw new Error('文件处理器未注册')
  return consumer
}

beforeEach(() => {
  importFilesAsNewTabs.mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('pwa 文件处理', () => {
  it('同名文件处理完成后可再次导入', async () => {
    const consumer = setupConsumer()
    const firstFile = createFile('文档.md', '首次内容')
    const updatedFile = createFile('文档.md', '更新内容')

    await consumer({ files: [createFileHandle('文档.md', async () => firstFile)] })
    await consumer({ files: [createFileHandle('文档.md', async () => updatedFile)] })

    expect(importFilesAsNewTabs.mock.calls).toEqual([
      [[firstFile]],
      [[updatedFile]],
    ])
  })

  it('首次读取失败后可重试', async () => {
    const consumer = setupConsumer()
    const retryFile = createFile('文档.md', '重试内容')
    const readError = new Error('读取失败')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    await consumer({ files: [createFileHandle('文档.md', async () => {
      throw readError
    })] })
    await consumer({ files: [createFileHandle('文档.md', async () => retryFile)] })

    expect(consoleError).toHaveBeenCalledWith('[bm.md] 无法读取文件:', readError)
    expect(importFilesAsNewTabs).toHaveBeenLastCalledWith([retryFile])
  })

  it('忽略同名文件正在处理时的并发重复', async () => {
    const consumer = setupConsumer()
    const file = createFile('文档.md', '内容')
    let finishRead: ((file: File) => void) | undefined
    const getFile = vi.fn(() => new Promise<File>((resolve) => {
      finishRead = resolve
    }))
    const handle = createFileHandle('文档.md', getFile)

    const firstLaunch = consumer({ files: [handle] })
    await consumer({ files: [handle] })

    expect(getFile).toHaveBeenCalledOnce()
    expect(importFilesAsNewTabs).not.toHaveBeenCalled()

    finishRead?.(file)
    await firstLaunch

    expect(importFilesAsNewTabs).toHaveBeenCalledOnce()
    expect(importFilesAsNewTabs).toHaveBeenCalledWith([file])
  })
})
