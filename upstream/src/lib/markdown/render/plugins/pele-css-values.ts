import type { FunctionNode, Node } from 'postcss-value-parser'
import valueParser from 'postcss-value-parser'

function variableParts(node: FunctionNode): { name: string, fallback?: Node[] } {
  if (node.unclosed)
    throw new Error('Pele 样式变量括号不完整')
  const comma = node.nodes.findIndex(part => part.type === 'div' && part.value === ',')
  return {
    name: valueParser.stringify(comma < 0 ? node.nodes : node.nodes.slice(0, comma)).trim(),
    fallback: comma < 0 ? undefined : node.nodes.slice(comma + 1),
  }
}

function resolveNodes(nodes: Node[], lookup: (name: string) => string | undefined): string | undefined {
  let result = ''
  for (const node of nodes) {
    if (node.type !== 'function' || node.value.toLowerCase() === 'url') {
      result += valueParser.stringify(node)
      continue
    }
    if (node.value.toLowerCase() === 'var') {
      const { name, fallback } = variableParts(node)
      const resolved = lookup(name) ?? (fallback && resolveNodes(fallback, lookup)?.trim())
      if (resolved === undefined)
        return undefined
      result += resolved
    }
    else {
      const resolved = resolveNodes(node.nodes, lookup)
      if (resolved === undefined)
        return undefined
      result += valueParser.stringify({ ...node, nodes: valueParser(resolved).nodes })
    }
  }
  return result
}

export function resolveVariableScope(local: Map<string, string>, inherited: Map<string, string>): Map<string, string> {
  const parsed = new Map([...local].map(([name, value]) => [name, valueParser(value.replace(/\s*!important\s*$/i, '')).nodes]))
  const cyclic = new Set<string>()
  const visited = new Set<string>()
  const stack: string[] = []
  // fallback 中的引用也属于依赖；环内声明整体无效，由消费端选择 fallback。
  const visit = (name: string): void => {
    const cycleStart = stack.indexOf(name)
    if (cycleStart >= 0) {
      for (const member of stack.slice(cycleStart))
        cyclic.add(member)
      return
    }
    if (visited.has(name) || !parsed.has(name))
      return
    stack.push(name)
    valueParser.walk(parsed.get(name)!, (node) => {
      if (node.type !== 'function')
        return
      if (node.value.toLowerCase() === 'url')
        return false
      if (node.value.toLowerCase() === 'var')
        visit(variableParts(node).name)
    })
    stack.pop()
    visited.add(name)
  }
  for (const name of local.keys())
    visit(name)
  const variables = new Map(inherited)
  const computed = new Set<string>()
  const lookup = (name: string): string | undefined => {
    if (!parsed.has(name) || computed.has(name))
      return variables.get(name)
    computed.add(name)
    // 无效局部声明仍遮蔽父作用域中的同名变量。
    variables.delete(name)
    const value = cyclic.has(name) ? undefined : resolveNodes(parsed.get(name)!, lookup)
    if (value !== undefined)
      variables.set(name, value)
    return value
  }
  for (const name of local.keys())
    lookup(name)
  return variables
}

function mixColors(node: FunctionNode): string {
  const content = valueParser.stringify(node.nodes)
  const match = content.match(/^\s*in\s+srgb\s*,\s*(#[\da-f]{6}|#[\da-f]{3})\s+([\d.]+)%\s*,\s*(#[\da-f]{6}|#[\da-f]{3})\s*$/i)
  if (!match || node.unclosed)
    throw new Error(`Pele 不支持的颜色混合：${content}`)
  const weight = Number(match[2]) / 100
  if (!Number.isFinite(weight) || weight < 0 || weight > 1)
    throw new Error(`Pele 颜色混合权重无效：${match[2]}`)
  const expand = (hex: string) => hex.length === 4 ? [...hex.slice(1)].map(char => char + char).join('') : hex.slice(1)
  const first = expand(match[1])
  const second = expand(match[3])
  return `#${[0, 2, 4].map(offset => Math.round(
    Number.parseInt(first.slice(offset, offset + 2), 16) * weight
    + Number.parseInt(second.slice(offset, offset + 2), 16) * (1 - weight),
  ).toString(16).padStart(2, '0')).join('')}`
}

const colorProperties = new Set([
  'fill',
  'stroke',
  'color',
  'stop-color',
  'flood-color',
  'lighting-color',
  'background-color',
  'stopColor',
  'floodColor',
  'lightingColor',
])

export function solidifyCssValue(value: string, variables: Map<string, string>, color: string, property: string): string {
  const resolved = resolveNodes(valueParser(value).nodes, name => variables.get(name))
  if (resolved === undefined)
    throw new Error(`Pele 样式变量缺失或循环引用：${value}`)
  const parsed = valueParser(resolved)
  if (colorProperties.has(property)) {
    parsed.walk((node) => {
      if (node.type === 'function' && node.value.toLowerCase() === 'url')
        return false
      if (node.type === 'word' && /^currentcolor$/i.test(node.value))
        node.value = color
    })
  }
  parsed.walk((node) => {
    if (node.type === 'function' && node.value.toLowerCase() === 'url')
      return false
    if (node.type === 'function' && node.value.toLowerCase() === 'color-mix') {
      if (!colorProperties.has(property))
        throw new Error(`Pele 存在未固化的样式：${resolved}`)
      Object.assign(node, { type: 'word', value: mixColors(node) })
      return false
    }
  })
  return valueParser.stringify(parsed.nodes)
}
