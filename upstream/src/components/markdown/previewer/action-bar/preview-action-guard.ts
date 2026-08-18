import { isPreviewReadyNow } from '../preview-ready'

export async function runPreviewAction(
  action: () => void | Promise<void>,
  isReady: () => boolean = isPreviewReadyNow,
): Promise<void> {
  if (!isReady()) {
    return
  }
  await action()
}
