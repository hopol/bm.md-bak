import { importFilesAsNewTabs } from '@/lib/file-importer'

const processingLaunches = new Set<string>()

export function initFileHandler() {
  if (!('launchQueue' in window))
    return

  window.launchQueue!.setConsumer(async (launchParams) => {
    if (!launchParams.files?.length)
      return

    const launchKey = JSON.stringify(launchParams.files
      .map(f => f.name)
      .sort())
    if (processingLaunches.has(launchKey)) {
      return
    }
    processingLaunches.add(launchKey)

    try {
      const files = await Promise.all(
        launchParams.files.map(async (fileHandle): Promise<File | null> => {
          try {
            return await fileHandle.getFile()
          }
          catch (err) {
            console.error('[bm.md] 无法读取文件:', err)
            return null
          }
        }),
      )

      await importFilesAsNewTabs(files.filter((file): file is File => file !== null))
    }
    finally {
      processingLaunches.delete(launchKey)
    }
  })
}
