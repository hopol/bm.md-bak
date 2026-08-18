export type FileTabKeyboardAction
  = | { type: 'activate', index: number, moveFocus: boolean }
    | { type: 'close' }
    | { type: 'rename' }

export function getFileTabKeyboardAction(
  key: string,
  currentIndex: number,
  fileCount: number,
): FileTabKeyboardAction | null {
  switch (key) {
    case 'ArrowLeft':
      return { type: 'activate', index: (currentIndex - 1 + fileCount) % fileCount, moveFocus: true }
    case 'ArrowRight':
      return { type: 'activate', index: (currentIndex + 1) % fileCount, moveFocus: true }
    case 'Home':
      return { type: 'activate', index: 0, moveFocus: true }
    case 'End':
      return { type: 'activate', index: fileCount - 1, moveFocus: true }
    case 'Enter':
    case ' ':
      return { type: 'activate', index: currentIndex, moveFocus: false }
    case 'F2':
      return { type: 'rename' }
    case 'Delete':
      return { type: 'close' }
    default:
      return null
  }
}
