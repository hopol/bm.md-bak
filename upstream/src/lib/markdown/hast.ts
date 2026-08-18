import type { Element, Root, Text } from 'hast'

export function isElement(node: unknown): node is Element {
  return !!node && typeof node === 'object' && (node as Element).type === 'element'
}

export function hasChildren(node: unknown): node is Root | Element {
  return !!node && typeof node === 'object' && Array.isArray((node as Root).children)
}

export function getClassList(node: Element): string[] {
  const className: unknown = node.properties?.className
  if (Array.isArray(className)) {
    return className.filter((item): item is string => typeof item === 'string')
  }
  if (typeof className === 'string') {
    return className.split(/\s+/).filter(Boolean)
  }
  return []
}

export function getTextContent(node: Element | Root): string {
  const texts: string[] = []

  function walk(parent: Element | Root) {
    for (const child of parent.children) {
      if (child.type === 'text') {
        texts.push((child as Text).value)
      }
      else if (isElement(child)) {
        walk(child)
      }
    }
  }

  walk(node)
  return texts.join('')
}
