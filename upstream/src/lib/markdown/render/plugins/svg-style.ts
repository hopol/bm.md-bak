import type { Element } from 'hast'

interface ResponsiveSvgOptions {
  visible?: boolean
}

export function makeSvgResponsive(svgNode: Element, options: ResponsiveSvgOptions = {}): void {
  const props = svgNode.properties || {}
  const existingStyle = typeof props.style === 'string' ? props.style : ''
  const responsiveStyle = [
    'width:100%',
    'max-width:100%',
    'height:auto',
    'display:block',
    options.visible ? 'visibility:visible' : '',
  ].filter(Boolean).join(';')

  delete props.width
  delete props.height

  props.style = existingStyle
    ? `${existingStyle};${responsiveStyle};`
    : `${responsiveStyle};`
  svgNode.properties = props
}
