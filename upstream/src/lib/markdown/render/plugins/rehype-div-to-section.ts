import type { Element, Root } from 'hast'
import type { Plugin } from 'unified'
import { SKIP, visit } from 'unist-util-visit'

const rehypeDivToSection: Plugin<[], Root> = () => {
  return (tree) => {
    visit(tree, 'element', (node: Element) => {
      const tagName = node.tagName.toLowerCase()
      if (tagName === 'svg' || tagName === 'foreignobject') {
        return SKIP
      }

      if (node.tagName === 'div') {
        node.tagName = 'section'
      }
    })
  }
}

export default rehypeDivToSection
