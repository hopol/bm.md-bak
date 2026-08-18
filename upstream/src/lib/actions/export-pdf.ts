import { toast } from 'sonner'
import { getPreviewIframe } from './preview'
import { getSafeRasterScale } from './raster'

let isExporting = false

const BLOCK_SELECTORS = 'p, li, blockquote, pre, img, figure, table, tr, dl, details, .markdown-alert, .math-display'
const HEADING_SELECTORS = 'h1, h2, h3, h4, h5, h6'
const MIN_PAGE_CONTENT_HEIGHT = 100
const HEADING_BOTTOM_GAP = 50

interface ElementBoundary {
  top: number
  bottom: number
  isHeading: boolean
}

export function findSafePageBreaks(
  content: HTMLElement,
  pageHeight: number,
): number[] {
  const breaks: number[] = []
  const contentRect = content.getBoundingClientRect()
  const contentHeight = contentRect.height

  if (contentHeight <= pageHeight || pageHeight <= 0)
    return breaks

  const elements = content.querySelectorAll(BLOCK_SELECTORS)
  const headings = content.querySelectorAll(HEADING_SELECTORS)

  const boundaries: ElementBoundary[] = []

  for (const el of elements) {
    const rect = el.getBoundingClientRect()
    const top = rect.top - contentRect.top
    const bottom = rect.bottom - contentRect.top
    if (bottom - top < pageHeight) {
      boundaries.push({ top, bottom, isHeading: false })
    }
  }

  for (const el of headings) {
    const rect = el.getBoundingClientRect()
    boundaries.push({
      top: rect.top - contentRect.top,
      bottom: rect.bottom - contentRect.top,
      isHeading: true,
    })
  }

  boundaries.sort((a, b) => a.top - b.top)

  let idealBreak = pageHeight

  while (idealBreak < contentHeight) {
    let safeBreak = idealBreak
    const lastBreak = breaks.length > 0 ? breaks[breaks.length - 1] : 0

    for (let i = 0; i <= boundaries.length; i++) {
      const previousBreak = safeBreak
      for (const { top, bottom, isHeading } of boundaries) {
        const crossesBreak = !isHeading && top < safeBreak && bottom > safeBreak
        const leavesHeadingAlone = isHeading
          && bottom <= safeBreak
          && safeBreak - bottom < HEADING_BOTTOM_GAP

        if (top > lastBreak && (crossesBreak || leavesHeadingAlone))
          safeBreak = Math.min(safeBreak, top)
      }

      if (safeBreak === previousBreak)
        break
    }

    if (safeBreak <= lastBreak + MIN_PAGE_CONTENT_HEIGHT)
      safeBreak = idealBreak

    breaks.push(safeBreak)
    idealBreak = safeBreak + pageHeight
  }

  return breaks
}

interface SvgPageSnapshot {
  height: number
  url: string
  width: number
}

function readSvgAttribute(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\b${name}=(['"])(.*?)\\1`, 'i'))
  return match?.[2] ?? null
}

function writeSvgAttribute(tag: string, name: string, value: string): string {
  const pattern = new RegExp(`\\b${name}=(['"])(.*?)\\1`, 'i')
  if (pattern.test(tag))
    return tag.replace(pattern, `${name}="${value}"`)
  return tag.replace(/>$/, ` ${name}="${value}">`)
}

function formatSvgNumber(value: number): string {
  return String(Number(value.toFixed(4)))
}

function isSafariLikeBrowser(): boolean {
  if (typeof navigator === 'undefined')
    return false

  const userAgent = navigator.userAgent.toLowerCase()
  const isSafari = userAgent.includes('safari')
    && !userAgent.includes('chrome')
    && !userAgent.includes('crios')
    && !userAgent.includes('fxios')
    && !userAgent.includes('android')
  const isIosWebView = userAgent.includes('applewebkit')
    && userAgent.includes('mobile')
    && !userAgent.includes('safari')

  return isSafari || isIosWebView
}

function splitCssValue(value: string, separator: ';' | ','): string[] {
  const parts: string[] = []
  let current = ''
  let depth = 0

  for (const character of value) {
    if (character === '(')
      depth++
    if (character === ')')
      depth = Math.max(0, depth - 1)

    if (character === separator && depth === 0) {
      parts.push(current.trim())
      current = ''
    }
    else {
      current += character
    }
  }

  if (current.trim())
    parts.push(current.trim())
  return parts.filter(Boolean)
}

function boxShadowToDropShadow(value: string): string {
  return splitCssValue(value, ',')
    .filter(shadow => !/\binset\b/i.test(shadow))
    .map((shadow) => {
      const lengths = shadow.match(/-?\d+(?:\.\d+)?px/gi) ?? []
      const [offsetX = '0px', offsetY = '0px', blur = '0px'] = lengths
      const color = shadow
        .replace(/-?\d+(?:\.\d+)?px/gi, '')
        .replace(/\binset\b/gi, '')
        .trim()
        .replace(/\s{2,}/g, ' ')
      return `drop-shadow(${offsetX} ${offsetY} ${blur}${color ? ` ${color}` : ''})`
    })
    .join(' ')
}

function rewriteSafariCssDeclarations(declarations: string): string {
  let filter: string | null = null
  let webkitFilter: string | null = null
  let boxShadow: string | null = null
  const preserved: string[] = []

  for (const declaration of splitCssValue(declarations, ';')) {
    const separatorIndex = declaration.indexOf(':')
    if (separatorIndex < 0)
      continue

    const property = declaration.slice(0, separatorIndex).trim().toLowerCase()
    const value = declaration.slice(separatorIndex + 1).trim()
    if (property === 'box-shadow')
      boxShadow = value
    else if (property === 'filter')
      filter = value
    else if (property === '-webkit-filter')
      webkitFilter = value
    else
      preserved.push(`${property}:${value}`)
  }

  if (boxShadow) {
    const dropShadow = boxShadowToDropShadow(boxShadow)
    if (dropShadow) {
      filter = filter ? `${filter} ${dropShadow}` : dropShadow
      webkitFilter = webkitFilter ? `${webkitFilter} ${dropShadow}` : dropShadow
    }
  }

  if (filter)
    preserved.push(`filter:${filter}`)
  if (webkitFilter)
    preserved.push(`-webkit-filter:${webkitFilter}`)
  return preserved.join(';')
}

function prepareSvgForSafari(markup: string): string {
  if (!isSafariLikeBrowser())
    return markup

  return markup
    .replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (styleTag, css: string) => (
      styleTag.replace(css, css.replace(/([^{}]+)\{([^}]*)\}/g, (_rule, selector, declarations) => (
        `${selector}{${rewriteSafariCssDeclarations(declarations)}}`
      )))
    ))
    .replace(/style=(['"])([\s\S]*?)\1/gi, (_attribute, quote, declarations) => (
      `style=${quote}${rewriteSafariCssDeclarations(declarations)}${quote}`
    ))
}

export function createSvgPageSnapshot(
  snapshotUrl: string,
  sourceY: number,
  sourceHeight: number,
  contentHeight: number,
): SvgPageSnapshot {
  const separatorIndex = snapshotUrl.indexOf(',')
  if (!snapshotUrl.startsWith('data:image/svg+xml') || separatorIndex < 0) {
    throw new Error('SnapDOM 未返回有效的 SVG 快照')
  }

  const svgMarkup = decodeURIComponent(snapshotUrl.slice(separatorIndex + 1))
  const rootMatch = svgMarkup.match(/<svg\b[^>]*>/i)
  if (!rootMatch) {
    throw new Error('SnapDOM SVG 缺少根元素')
  }

  const viewBoxValue = readSvgAttribute(rootMatch[0], 'viewBox')
  const viewBox = viewBoxValue?.trim().split(/[\s,]+/).map(Number)
  if (!viewBox || viewBox.length !== 4 || viewBox.some(value => !Number.isFinite(value))) {
    throw new Error('SnapDOM SVG 缺少有效的 viewBox')
  }
  if (sourceHeight <= 0 || contentHeight <= 0) {
    throw new Error('PDF 分页尺寸无效')
  }

  const [viewBoxX, viewBoxY, viewBoxWidth, viewBoxHeight] = viewBox
  const viewBoxRatio = viewBoxHeight / contentHeight
  const pageViewBoxY = viewBoxY + sourceY * viewBoxRatio
  const pageViewBoxHeight = sourceHeight * viewBoxRatio
  const scale = getSafeRasterScale(viewBoxWidth, pageViewBoxHeight)
  const width = Math.max(1, Math.floor(viewBoxWidth * scale))
  const height = Math.max(1, Math.floor(pageViewBoxHeight * scale))

  let pageRoot = writeSvgAttribute(rootMatch[0], 'width', String(width))
  pageRoot = writeSvgAttribute(pageRoot, 'height', String(height))
  pageRoot = writeSvgAttribute(pageRoot, 'viewBox', [
    viewBoxX,
    pageViewBoxY,
    viewBoxWidth,
    pageViewBoxHeight,
  ].map(formatSvgNumber).join(' '))

  const pageMarkup = prepareSvgForSafari(svgMarkup.replace(rootMatch[0], pageRoot))
  return {
    height,
    url: `${snapshotUrl.slice(0, separatorIndex + 1)}${encodeURIComponent(pageMarkup)}`,
    width,
  }
}

async function drawSvgPage(
  page: SvgPageSnapshot,
  canvas: HTMLCanvasElement,
  backgroundColor: string,
): Promise<void> {
  const image = new Image()
  image.crossOrigin = 'anonymous'
  image.decoding = 'sync'
  image.loading = 'eager'
  image.src = page.url
  await image.decode()

  if (isSafariLikeBrowser()) {
    image.style.cssText = 'position:fixed;left:-99999px;top:-99999px;pointer-events:none'
    document.body.appendChild(image)
    try {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      })
    }
    finally {
      image.remove()
    }
  }

  canvas.width = page.width
  canvas.height = page.height
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('无法创建 canvas context')
  }

  context.fillStyle = backgroundColor
  context.fillRect(0, 0, page.width, page.height)
  context.drawImage(image, 0, 0, page.width, page.height)
  image.src = ''
}

function compositeBackgroundColors(colors: string[]): [number, number, number] {
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context)
    return [255, 255, 255]

  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, 1, 1)
  for (const color of colors) {
    context.fillStyle = color
    context.fillRect(0, 0, 1, 1)
  }

  const [red, green, blue] = context.getImageData(0, 0, 1, 1).data
  canvas.width = 0
  canvas.height = 0
  return [red, green, blue]
}

export async function exportPdf() {
  if (isExporting) {
    toast.info('正在导出中，请稍候…')
    return
  }

  const preview = getPreviewIframe()
  if (!preview)
    return

  isExporting = true
  const loadingToast = toast.loading('正在生成 PDF…')
  let pageCanvas: HTMLCanvasElement | null = null

  try {
    const [{ snapdom }, { default: JsPDF }] = await Promise.all([
      import('@zumer/snapdom'),
      import('jspdf'),
    ])

    const contentRect = preview.content.getBoundingClientRect()
    if (contentRect.width <= 0 || contentRect.height <= 0) {
      toast.error('没有可导出的内容', { id: loadingToast })
      return
    }

    // SnapDOM 不提供裁切坐标。先生成一次内联资源的 SVG，再通过 viewBox 逐页栅格化。
    const snapshot = await snapdom(preview.content, { dpr: 1 })

    const a4Width = 210
    const a4Height = 297
    const padding = 8

    const contentWidth = a4Width - padding * 2
    const contentHeight = a4Height - padding * 3

    const domPageHeight = contentRect.width * contentHeight / contentWidth
    const pageBreaks = findSafePageBreaks(preview.content, domPageHeight)
    const pageBoundaries = [0, ...pageBreaks, contentRect.height]

    const bodyBackground = getComputedStyle(preview.content.ownerDocument.body).backgroundColor
    const contentBackground = getComputedStyle(preview.content).backgroundColor
    const canvasBackground = compositeBackgroundColors([bodyBackground])
    const pdfBackground = compositeBackgroundColors([bodyBackground, contentBackground])
    const canvasBackgroundColor = `rgb(${canvasBackground.join(', ')})`

    const pdf = new JsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    })

    pageCanvas = document.createElement('canvas')
    for (let i = 0; i < pageBoundaries.length - 1; i++) {
      const sourceY = pageBoundaries[i]
      const sourceHeight = pageBoundaries[i + 1] - sourceY
      if (sourceHeight <= 0)
        continue

      if (i > 0)
        pdf.addPage()

      const page = createSvgPageSnapshot(
        snapshot.url,
        sourceY,
        sourceHeight,
        contentRect.height,
      )
      await drawSvgPage(page, pageCanvas, canvasBackgroundColor)

      const targetHeight = sourceHeight * contentWidth / contentRect.width
      const pageImgData = pageCanvas.toDataURL('image/jpeg', 0.92)

      pdf.setFillColor(...pdfBackground)
      pdf.rect(0, 0, a4Width, a4Height, 'F')
      pdf.addImage(pageImgData, 'JPEG', padding, padding * 1.5, contentWidth, targetHeight)
    }

    pdf.save('bm.md.pdf')
    toast.success('已导出 PDF', { id: loadingToast })
  }
  catch (error) {
    console.error(error)
    if (error instanceof Error && error.message.includes('import')) {
      toast.error('PDF 组件加载失败，请刷新重试', { id: loadingToast })
    }
    else {
      toast.error('导出 PDF 失败', { id: loadingToast })
    }
  }
  finally {
    if (pageCanvas) {
      pageCanvas.width = 0
      pageCanvas.height = 0
    }
    isExporting = false
  }
}

export function printPreview() {
  const preview = getPreviewIframe()
  if (!preview)
    return

  try {
    const contentWindow = preview.iframe.contentWindow
    if (!contentWindow) {
      toast.error('无法访问预览窗口')
      return
    }
    contentWindow.print()
  }
  catch (error) {
    toast.error('打印失败')
    console.error(error)
  }
}
