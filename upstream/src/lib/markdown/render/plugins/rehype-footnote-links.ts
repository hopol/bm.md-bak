import type { Element, Root } from 'hast'
import type { Plugin } from 'unified'
import { visit } from 'unist-util-visit'
import { getTextContent } from '@/lib/markdown/hast'
import { createFootnoteReference, createFootnoteSection } from './footnote-hast'

interface FootnoteLink {
  id: number
  href: string
  text: string
}

interface Options {
  referenceTitle?: string
}

const rehypeFootnoteLinks: Plugin<[Options?], Root> = (options = {}) => {
  const { referenceTitle = 'References' } = options

  return (tree) => {
    const links: FootnoteLink[] = []
    const seenUrls = new Set<string>()
    let counter = 1

    visit(tree, 'element', (node: Element, index, parent) => {
      if (node.tagName !== 'a' || !node.properties?.href) {
        return
      }

      const href = String(node.properties.href)
      if (!href.startsWith('http://') && !href.startsWith('https://')) {
        return
      }

      if (seenUrls.has(href)) {
        const existingLink = links.find(l => l.href === href)
        if (existingLink && parent && typeof index === 'number') {
          parent.children.splice(index + 1, 0, createFootnoteReference(existingLink.id))
        }
        return
      }

      const text = getTextContent(node).trim() || node.properties.href?.toString() || ''
      const id = counter++
      links.push({ id, href, text })
      seenUrls.add(href)

      if (parent && typeof index === 'number') {
        parent.children.splice(index + 1, 0, createFootnoteReference(id))
      }
    })

    if (links.length === 0) {
      return
    }

    const footnoteSection = createFootnoteSection(referenceTitle, links.map(link => ({
      type: 'element',
      tagName: 'li',
      properties: { id: `user-content-fn-${link.id}` },
      children: [
        {
          type: 'element',
          tagName: 'span',
          properties: {},
          children: [{ type: 'text', value: `${link.text}: ` }],
        },
        {
          type: 'element',
          tagName: 'a',
          properties: { href: link.href },
          children: [{ type: 'text', value: link.href }],
        },
      ],
    } as Element)))

    tree.children.push(footnoteSection)
  }
}

export default rehypeFootnoteLinks
