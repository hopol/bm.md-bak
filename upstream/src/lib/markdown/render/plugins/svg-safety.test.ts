import type { Element } from 'hast'
import { describe, expect, it } from 'vitest'
import { parseSvg } from './rehype-svg-renderer'
import { prefixSvgIds, sanitizeSvgElement } from './svg-safety'

function elementChildren(node: Element): Element[] {
  return node.children.filter((child): child is Element => child.type === 'element')
}

function findElement(node: Element, tagName: string): Element | undefined {
  if (node.tagName === tagName) {
    return node
  }

  for (const child of elementChildren(node)) {
    const found = findElement(child, tagName)
    if (found) {
      return found
    }
  }
}

function findElementById(node: Element, id: string): Element | undefined {
  if (node.properties?.id === id) {
    return node
  }

  for (const child of elementChildren(node)) {
    const found = findElementById(child, id)
    if (found) {
      return found
    }
  }
}

function normalizePropertyName(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, '')
}

function propertyByNormalizedName(node: Element, normalizedName: string): unknown {
  return Object.entries(node.properties ?? {})
    .find(([name]) => normalizePropertyName(name) === normalizedName)?.[1]
}

function expectElement(node: Element | undefined): Element {
  expect(node).toBeDefined()
  if (!node) {
    throw new Error('Expected SVG element to exist')
  }
  return node
}

describe('svg safety helpers', () => {
  it('sanitizes unsafe SVG content and prefixes local fragment references', () => {
    const svg = parseSvg(`
      <svg onload="alert(1)">
        <title id="title">标题</title>
        <desc id="desc">描述</desc>
        <script>alert(1)</script>
        <defs>
          <linearGradient id="grad"><stop offset="0%" /></linearGradient>
        </defs>
        <style>
          @import url("https://example.com/evil.css");
          #box .label { fill: #333; }
          .box { fill: url(#grad); stroke: url(http://example.com/evil.svg#x); }
        </style>
        <a id="external-link" href="http://example.com/evil"><text>bad</text></a>
        <use id="javascript-use" href="javascript:alert(1)" />
        <use id="fragment-use" href=" #grad " />
        <rect id="box" aria-labelledby="title desc" onload="alert(1)" fill="url(#grad)" style="fill:url(#grad);stroke:url(https://example.com/evil.svg#x)" />
      </svg>
    `)

    sanitizeSvgElement(svg)
    prefixSvgIds(svg, 'safe-')

    expect(findElement(svg, 'script')).toBeUndefined()
    expect(propertyByNormalizedName(svg, 'onload')).toBeUndefined()

    const externalLink = findElementById(svg, 'safe-external-link')
    const javascriptUse = findElementById(svg, 'safe-javascript-use')
    const fragmentUse = findElementById(svg, 'safe-fragment-use')
    const rect = findElementById(svg, 'safe-box')
    const style = findElement(svg, 'style')

    const safeExternalLink = expectElement(externalLink)
    const safeJavascriptUse = expectElement(javascriptUse)
    const safeFragmentUse = expectElement(fragmentUse)
    const safeRect = expectElement(rect)
    const safeStyle = expectElement(style)

    expect(propertyByNormalizedName(safeExternalLink, 'href')).toBeUndefined()
    expect(propertyByNormalizedName(safeJavascriptUse, 'href')).toBeUndefined()
    expect(propertyByNormalizedName(safeFragmentUse, 'href')).toBe('#safe-grad')
    expect(propertyByNormalizedName(safeRect, 'onload')).toBeUndefined()
    expect(propertyByNormalizedName(safeRect, 'arialabelledby')).toEqual(['safe-title', 'safe-desc'])
    expect(safeRect.properties?.fill).toBe('url(#safe-grad)')
    expect(safeRect.properties?.style).toBe('fill:url(#safe-grad);stroke:none')
    expect(safeStyle.children).toHaveLength(1)
    expect(safeStyle.children[0]).toMatchObject({
      type: 'text',
      value: expect.stringContaining('fill: url(#safe-grad)'),
    })
    expect(safeStyle.children[0]).toMatchObject({ value: expect.stringContaining('#safe-box .label') })
    expect(safeStyle.children[0]).toMatchObject({ value: expect.not.stringContaining('@import') })
    expect(safeStyle.children[0]).toMatchObject({ value: expect.not.stringContaining('http://example.com') })
  })
})
