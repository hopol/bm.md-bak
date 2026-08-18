interface TransformStyle {
  transform: string
  removeProperty?: (property: string) => void
}

interface TransformTarget {
  style: TransformStyle
}

type FrameScheduler = (callback: () => void) => unknown

export function restoreScrollState(
  target: TransformTarget | null,
  scheduler: FrameScheduler = callback => requestAnimationFrame(callback),
) {
  if (!target)
    return

  // Chromium 在分栏调整后可能保留 iframe 的旧合成层滚动位置，短暂切换合成层可使其重新同步。
  target.style.transform = 'translateZ(0)'
  scheduler(() => {
    if (target.style.removeProperty)
      target.style.removeProperty('transform')
    else
      target.style.transform = ''
  })
}

export function restorePreviewScrollState() {
  restoreScrollState(document.getElementById('bm-preview-iframe'))
}
