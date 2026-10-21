import type { Element } from 'hast'
import { visit } from 'unist-util-visit'
import { describe, expect, it, vi } from 'vitest'
import { getTextContent } from '@/lib/markdown/hast'
import { render } from '../html'
import { parseSvg } from './rehype-svg-renderer'

function fenced(code: string): string {
  return `\`\`\`mermaid\n${code}\n\`\`\``
}

// 最小语法根据 Pele 1.6.0 官方各图表测试整理，覆盖 registry 的全部 33 类。
const peleFixtures = [
  ['agentflow', 'agentflow-beta TB\n a', 'a'],
  ['architecture', 'architecture-beta\n group api(cloud)[API]', 'API'],
  ['block', 'block\n A', 'A'],
  ['c4', 'C4Context\n Person(a, "A")', 'A'],
  ['class', 'classDiagram\n A --> B', 'A'],
  ['cynefin', 'cynefin-beta\n complex', 'Complex'],
  ['er', 'erDiagram\n A', 'A'],
  ['eventmodeling', 'eventmodeling\n timeframe 01 event Start', 'Start'],
  ['flowchart', 'graph TD\n A', 'A'],
  ['gantt', 'gantt\n A :3d', 'A'],
  ['gitGraph', 'gitGraph\n commit', 'main'],
  ['info', 'info\n title', 'Pele v1.6.0'],
  ['ishikawa', 'ishikawa\n E', 'E'],
  ['journey', 'journey\n a: 5:', 'a'],
  ['kanban', 'kanban\n a', 'a'],
  ['mindmap', 'mindmap\n root', 'root'],
  ['packet', 'packet\n 0: ""', '0'],
  ['pie', 'pie\n "a": 1', 'a'],
  ['quadrantChart', 'quadrantChart\n x-axis a', 'a'],
  ['radar', 'radar-beta\n axis a', 'a'],
  ['railroad', 'railroad-ebnf-beta\n r = a ;', 'r'],
  ['requirement', 'requirementDiagram\n requirement a {\n text: short\n }', 'short'],
  ['sankey', 'sankey\n a,b,1', 'a'],
  ['sequence', 'sequenceDiagram\n A->>B: hi', 'hi'],
  ['state', 'stateDiagram\n a --> b', 'a'],
  ['swimlane', 'swimlane-beta TD\n a --> b', 'a'],
  ['timeline', 'timeline\n 2001 : a', '2001'],
  ['treeView', 'treeView-beta\n "Root"', 'Root'],
  ['treemap', 'treemap\n "a": 1', 'a'],
  ['usecase', 'usecase-beta\n A', 'A'],
  ['venn', 'venn-beta\n set A', 'A'],
  ['wardley', 'wardley-beta\n---\nx\n---\nA->B', 'Evolution'],
  ['xychart', 'xychart\n line [7]', '7'],
] as const

describe('pele 全部 33 类图表经过项目管道', () => {
  it.each(peleFixtures)('%s 生成清洗并固化的 SVG', async (_type, code, text) => {
    const html = await render({ markdown: fenced(code) })
    expect(html).toContain('class="figure-mermaid"')
    expect(html).not.toContain('figure-mermaid-error')
    const svg = html.slice(html.indexOf('<svg'), html.lastIndexOf('</svg>') + 6)
    expect(svg).toContain('<svg')
    const visible: string[] = []
    visit(parseSvg(svg), 'element', (node) => {
      if (node.tagName === 'text')
        visible.push(getTextContent(node))
    })
    expect(visible.join(' ')).toContain(text)
    const viewBox = String(parseSvg(svg).properties.viewBox).split(/[\s,]+/).map(Number)
    expect(viewBox).toHaveLength(4)
    expect(viewBox.every(Number.isFinite)).toBe(true)
    expect(viewBox[2]).toBeGreaterThan(0)
    expect(viewBox[3]).toBeGreaterThan(0)
    expect(svg).not.toMatch(/var\(|currentcolor|color-mix\(|--pele-|--_[a-z]/i)
  })

  it('交错并发主题不互相污染，固定用户 style/classDef 仍然优先', async () => {
    const markdown = fenced('flowchart TD\n A[开始] --> B[结束]\n classDef custom fill:#123456,stroke:#abcdef,color:#fedcba\n class A custom\n style B fill:#654321')
    const results = await Promise.all((['dark', '', 'dark', ''] as const).map(theme => render({ markdown, mermaidTheme: theme })))
    for (const [index, html] of results.entries()) {
      expect(html).not.toContain('figure-mermaid-error')
      expect(parseSvg(html.slice(html.indexOf('<svg'))).properties.style).toContain(`background-color:${index % 2 === 0 ? '#18181b' : '#ffffff'}`)
      expect(html).toContain('fill:#123456')
      expect(html).toContain('fill:#654321')
      expect(html).toContain('#fedcba')
    }
  })

  it.each([
    ['这是一个用于验证图表自动换行能力的非常长的中文标签确保文字不会被截断并保持完整可读', false],
    ['这是 一个 用于 验证 图表 自动 换行 能力 的 非常 长的 中文 标签 确保 文字 不会 被截断', true],
  ])('长标签文字完整、按需换行且基线位于节点高度内：%s', async (label, wrapped) => {
    const html = await render({ markdown: fenced(`flowchart TD\n A[${label}]`) })
    expect(html).not.toContain('figure-mermaid-error')
    const svg = parseSvg(html.slice(html.indexOf('<svg')))
    const texts: Element[] = []
    const rectangles: Element[] = []
    visit(svg, 'element', (node) => {
      if (node.tagName === 'tspan' || (node.tagName === 'text' && !node.children.some(child => child.type === 'element' && child.tagName === 'tspan')))
        texts.push(node)
      if (node.tagName === 'rect')
        rectangles.push(node)
    })
    expect(texts.map(getTextContent).join('').replace(/\s/g, '')).toBe(label.replace(/\s/g, ''))
    if (wrapped)
      expect(texts.length).toBeGreaterThan(1)
    else
      expect(texts).toHaveLength(1)
    const rect = rectangles[0].properties
    for (const text of texts) {
      expect(Number(text.properties.y)).toBeGreaterThan(Number(rect.y))
      expect(Number(text.properties.y)).toBeLessThan(Number(rect.y) + Number(rect.height))
    }
  })

  it.each(['unknownDiagram\n A', 'flowchart TD\n A['])('非法语法回退错误 figure 且保留原始源码', async (code) => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const html = await render({ markdown: fenced(code) })
      expect(html).toContain('figure-mermaid-error')
      expect(html).toContain('data-bm-rich="mermaid"')
      expect(html).toContain(code)
    }
    finally {
      error.mockRestore()
    }
  })
})
