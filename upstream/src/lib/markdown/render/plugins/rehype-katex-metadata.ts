import type { Element, Root } from 'hast'
import type { Plugin } from 'unified'
import { visit } from 'unist-util-visit'
import { getClassList, getTextContent } from '@/lib/markdown/hast'
import { createRichMetadata, richData } from './rich-metadata'

function isDisplayKatex(node: Element): boolean {
  return getClassList(node).includes('katex-display')
}

function isInlineKatex(node: Element, parent?: Element): boolean {
  if (!getClassList(node).includes('katex')) {
    return false
  }

  return !parent || !isDisplayKatex(parent)
}

const rehypeKatexMetadata: Plugin<[], Root> = () => {
  return (tree) => {
    visit(tree, 'element', (node: Element, _index, parent) => {
      const parentElement = parent?.type === 'element' ? parent as Element : undefined
      if (!isDisplayKatex(node) && !isInlineKatex(node, parentElement)) {
        return
      }

      node.properties = {
        ...node.properties,
        ...richData(createRichMetadata('katex', getTextContent(node))),
      }
    })
  }
}

export default rehypeKatexMetadata
