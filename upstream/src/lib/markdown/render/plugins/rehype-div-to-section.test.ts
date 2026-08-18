import type { Root } from 'hast'
import { unified } from 'unified'
import { describe, expect, it } from 'vitest'
import rehypeDivToSection from './rehype-div-to-section'

describe('rehypeDivToSection', () => {
  it('skips div elements inside svg and foreignObject', async () => {
    const tree: Root = {
      type: 'root',
      children: [
        {
          type: 'element',
          tagName: 'div',
          properties: {},
          children: [{ type: 'text', value: '正文' }],
        },
        {
          type: 'element',
          tagName: 'svg',
          properties: {},
          children: [
            {
              type: 'element',
              tagName: 'foreignObject',
              properties: {},
              children: [
                {
                  type: 'element',
                  tagName: 'div',
                  properties: {},
                  children: [{ type: 'text', value: 'SVG 内部' }],
                },
              ],
            },
          ],
        },
      ],
    }

    await unified().use(rehypeDivToSection).run(tree)

    const [bodyNode, svgNode] = tree.children
    expect(bodyNode).toMatchObject({ type: 'element', tagName: 'section' })
    expect(svgNode).toMatchObject({
      type: 'element',
      tagName: 'svg',
      children: [
        {
          type: 'element',
          tagName: 'foreignObject',
          children: [{ type: 'element', tagName: 'div' }],
        },
      ],
    })
  })
})
