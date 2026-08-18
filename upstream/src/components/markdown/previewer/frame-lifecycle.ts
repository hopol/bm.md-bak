export type CommitRenderedSignature = (signature: string | null) => void

export function getReadySignature(
  signature: string,
  commitReady: boolean,
  isCurrent: boolean,
): string | null {
  return commitReady && isCurrent ? signature : null
}

export class PreviewFrameLifecycle {
  private frame: object | null = null
  private loaded = false
  private ready = false

  constructor(private readonly commitSignature: CommitRenderedSignature) {}

  reset(frame: object): void {
    this.frame = frame
    this.loaded = false
    this.ready = false
    this.commitSignature(null)
  }

  dispose(frame: object): void {
    if (this.frame !== frame) {
      return
    }
    this.frame = null
    this.loaded = false
    this.ready = false
    this.commitSignature(null)
  }

  markLoaded(frame: object): boolean {
    if (this.frame !== frame) {
      return false
    }
    this.loaded = true
    return true
  }

  canSync(frame: object | null): boolean {
    return frame !== null && this.frame === frame && this.loaded
  }

  markSynced(frame: object, signature: string | null): boolean {
    if (!this.canSync(frame)) {
      return false
    }
    this.ready = signature !== null
    this.commitSignature(signature)
    return this.ready
  }

  isReady(frame: object | null): boolean {
    return frame !== null && this.frame === frame && this.ready
  }
}
