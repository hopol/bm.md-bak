import type { Element } from 'hast'

export function createFootnoteReference(id: number): Element {
  return {
    type: 'element',
    tagName: 'sup',
    properties: { className: ['footnote-ref'] },
    children: [{ type: 'text', value: `[${id}]` }],
  }
}

export function createFootnoteSection(referenceTitle: string, items: Element[]): Element {
  return {
    type: 'element',
    tagName: 'section',
    properties: { className: ['footnotes'], dataFootnotes: '' },
    children: [
      {
        type: 'element',
        tagName: 'h4',
        properties: {},
        children: [{ type: 'text', value: referenceTitle }],
      },
      {
        type: 'element',
        tagName: 'ol',
        properties: {},
        children: items,
      },
    ],
  }
}
