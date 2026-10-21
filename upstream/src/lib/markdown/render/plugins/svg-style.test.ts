import type { Element } from 'hast'
import { describe, expect, it } from 'vitest'
import { applyRootFontFamily, makeSvgResponsive } from './svg-style'

function createSvg(width?: string | number): Element {
  return {
    type: 'element',
    tagName: 'svg',
    properties: width === undefined ? {} : { width, height: '100' },
    children: [],
  }
}

// Infographic 内部样式不应被根字体设置改写。
const MERMAID_STYLE_VALUE = `
  text { font-family: 'Inter', system-ui, sans-serif; }
  .mono { font-family: 'JetBrains Mono', 'SF Mono', 'Fira Code', ui-monospace, monospace; }
  svg {
    --_text: var(--fg);
  }
`

function createSvgWithStyle(styleValue: string): Element {
  return {
    type: 'element',
    tagName: 'svg',
    properties: {},
    children: [
      {
        type: 'element',
        tagName: 'style',
        properties: {},
        children: [{ type: 'text', value: styleValue }],
      },
    ],
  }
}

function getStyleValue(svg: Element): string {
  const style = svg.children.find(child => child.type === 'element' && child.tagName === 'style') as Element
  return (style.children[0] as { value: string }).value
}

describe('makeSvgResponsive', () => {
  it.each([275, '275', '275px', ' 275.5px '])('limits SVG width to its natural width from %s', (width) => {
    const svg = createSvg(width)

    makeSvgResponsive(svg)

    expect(svg.properties).not.toHaveProperty('width')
    expect(svg.properties).not.toHaveProperty('height')
    const expectedWidth = width === ' 275.5px ' ? '275.5px' : '275px'
    expect(svg.properties.style).toContain(`width:100%;max-width:${expectedWidth};height:auto;display:block;margin:0 auto;`)
  })

  it.each(['100%', '2em', '0', -1])('falls back to container width for invalid width %s', (width) => {
    const svg = createSvg(width)

    makeSvgResponsive(svg)

    expect(svg.properties.style).toContain('width:100%;max-width:100%;height:auto;display:block;margin:0 auto;')
  })

  it('falls back to container width for a viewBox-only SVG', () => {
    const svg = createSvg()
    svg.properties.viewBox = '0 0 275 100'

    makeSvgResponsive(svg)

    expect(svg.properties.style).toContain('width:100%;max-width:100%;height:auto;display:block;margin:0 auto;')
  })
})

describe('applyRootFontFamily', () => {
  it('只设置根 SVG 的 font-family 属性', () => {
    const svg = createSvgWithStyle(MERMAID_STYLE_VALUE)

    applyRootFontFamily(svg, 'sans-serif')

    expect(svg.properties.fontFamily).toBe('sans-serif')
    expect(getStyleValue(svg)).toBe(MERMAID_STYLE_VALUE)
  })
})
