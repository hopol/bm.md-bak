import type { Element } from 'hast'
import valueParser from 'postcss-value-parser'
import { resolveVariableScope, solidifyCssValue } from './pele-css-values'

function declarations(style: string): Map<string, string> {
  const parts = ['']
  for (const node of valueParser(style).nodes) {
    const chunks = node.type === 'word' ? node.value.split(';') : [valueParser.stringify(node)]
    parts[parts.length - 1] += chunks[0]
    parts.push(...chunks.slice(1))
  }
  const entries = new Map<string, string>()
  for (const declaration of parts) {
    const colon = declaration.indexOf(':')
    if (colon < 1)
      continue
    const name = declaration.slice(0, colon).trim()
    const key = name.startsWith('--') ? name : name.toLowerCase()
    const value = declaration.slice(colon + 1).trim()
    if (!/!important\s*$/i.test(entries.get(key) ?? '') || /!important\s*$/i.test(value))
      entries.set(key, value)
  }
  return entries
}

const presentationProperties = new Set([
  'fill',
  'stroke',
  'color',
  'fontFamily',
  'fontWeight',
  'fontSize',
  'stopColor',
  'floodColor',
  'lightingColor',
  'rx',
  'ry',
])

export function solidifyPeleSvgStyle(svg: Element, tokens: Record<string, string>): void {
  function walk(node: Element, inherited: Map<string, string>, parentColor: string): void {
    const style = declarations(typeof node.properties.style === 'string' ? node.properties.style : '')
    const local = new Map([...style].filter(([name]) => name.startsWith('--')))
    const variables = resolveVariableScope(local, inherited)
    const solidify = (value: string, color: string, property: string): string => solidifyCssValue(value, variables, color, property)
    const rawColor = style.get('color') ?? String(node.properties.color ?? parentColor)
    let color = solidify(rawColor, parentColor, 'color').replace(/\s*!important\s*$/i, '')
    if (/^(?:inherit|unset)$/i.test(color))
      color = parentColor
    for (const [name, value] of Object.entries(node.properties)) {
      if (name.startsWith('--'))
        delete node.properties[name]
      else if (presentationProperties.has(name) && typeof value === 'string')
        node.properties[name] = solidify(value, color, name)
    }
    const fixed: string[] = []
    for (const [name, value] of style) {
      if (!name.startsWith('--'))
        fixed.push(`${name}:${solidify(value, name === 'color' ? parentColor : color, name)}`)
    }
    if (fixed.length)
      node.properties.style = fixed.join(';')
    else
      delete node.properties.style
    for (const child of node.children) {
      if (child.type === 'element')
        walk(child, variables, color)
    }
  }
  walk(svg, new Map(Object.entries(tokens)), tokens['--pele-fg'] ?? '#1f1f1f')
  svg.properties.style = `${svg.properties.style ? `${svg.properties.style};` : ''}background-color:${tokens['--pele-bg'] ?? '#ffffff'}`
}
