import type { Element } from 'hast'

interface ResponsiveSvgOptions {
  visible?: boolean
}

export function makeSvgResponsive(svgNode: Element, options: ResponsiveSvgOptions = {}): void {
  const props = svgNode.properties || {}
  const existingStyle = typeof props.style === 'string' ? props.style : ''
  const width = props.width
  const widthMatch = typeof width === 'string'
    ? width.trim().match(/^(\d+(?:\.\d+)?)(?:px)?$/)
    : undefined
  const naturalWidth = typeof width === 'number'
    ? width
    : widthMatch
      ? Number(widthMatch[1])
      : undefined
  const maxWidth = naturalWidth !== undefined && Number.isFinite(naturalWidth) && naturalWidth > 0
    ? `${naturalWidth}px`
    : '100%'
  const responsiveStyle = [
    'width:100%',
    `max-width:${maxWidth}`,
    'height:auto',
    'display:block',
    'margin:0 auto',
    options.visible ? 'visibility:visible' : '',
  ].filter(Boolean).join(';')

  delete props.width
  delete props.height

  props.style = existingStyle
    ? `${existingStyle};${responsiveStyle};`
    : `${responsiveStyle};`
  svgNode.properties = props
}

export function applyRootFontFamily(svgNode: Element, fontFamily?: string): void {
  if (fontFamily) {
    svgNode.properties.fontFamily = fontFamily
  }
}
