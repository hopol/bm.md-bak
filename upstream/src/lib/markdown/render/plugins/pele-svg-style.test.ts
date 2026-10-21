import type { Element } from 'hast'
import { render as renderPele } from 'pele'
import rehypeStringify from 'rehype-stringify'
import { unified } from 'unified'
import { describe, expect, it, vi } from 'vitest'
import { resolvePeleTokens } from '@/themes/mermaid-theme/tokens'
import { solidifyPeleSvgStyle } from './pele-svg-style'
import rehypeMermaid from './rehype-mermaid'
import { parseSvg } from './rehype-svg-renderer'
import { sanitizeSvgElement } from './svg-safety'

vi.mock('pele', async (importOriginal) => {
  const original = await importOriginal<typeof import('pele')>()
  return { ...original, render: vi.fn(original.render) }
})

function fixed(source: string, theme: '' | 'dark' = ''): Element {
  const svg = parseSvg(source)
  sanitizeSvgElement(svg)
  solidifyPeleSvgStyle(svg, resolvePeleTokens(theme))
  return svg
}

function child(svg: Element, index = 0): Element {
  return svg.children[index] as Element
}

describe('pele SVG 样式固化', () => {
  it('完整覆盖 23 个公共 token，字体来自实际排版参数', () => {
    const tokens = resolvePeleTokens('dark', 'Georgia, serif')
    expect(Object.keys(tokens)).toHaveLength(23)
    expect(tokens['--pele-font']).toBe('Georgia, serif')
    expect(tokens['--pele-series-8']).toBe('#cba58b')
  })

  it('父变量先在父作用域计算，子变量局部遮蔽且兄弟互不污染', () => {
    const svg = fixed('<svg style="--a:#123456;--alias:var(--a)"><g style="--a:#abcdef"><rect fill="var(--a)" stroke="var(--alias)"/></g><rect fill="var(--a)"/></svg>')
    expect(child(child(svg)).properties).toMatchObject({ fill: '#abcdef', stroke: '#123456' })
    expect(child(svg, 1).properties.fill).toBe('#123456')
    expect(svg.properties.style).toBe('background-color:#ffffff')
  })

  it('嵌套 fallback 保留带逗号字体，局部变量声明顺序不影响求值', () => {
    const svg = fixed('<svg style="--a:var(--b);--b:#123456;font-family:var(--missing,var(--absent,Georgia, serif));fill:var(--a)"><rect style="rx:var(--pele-radius)"/></svg>')
    expect(svg.properties.style).toBe('font-family:Georgia, serif;fill:#123456;background-color:#ffffff')
    expect(child(svg).properties.style).toBe('rx:4px')
  })

  it('循环与缺失变量使用 fallback，否则明确失败', () => {
    expect(fixed('<svg style="--a:var(--b);--b:var(--a);fill:var(--a,#abcdef)"/>').properties.style).toBe('fill:#abcdef;background-color:#ffffff')
    expect(() => fixed('<svg fill="var(--missing)"/>')).toThrow(/变量缺失/)
    expect(() => fixed('<svg style="--a:var(--a);fill:var(--a)"/>')).toThrow(/循环引用/)
    expect(() => fixed('<svg fill="var(--missing"/>')).toThrow(/括号不完整/)
  })

  it.each([
    '--a:var(--a,#123456)',
    '--a:var(--b,#123456);--b:var(--a,#654321)',
  ])('变量环内部 fallback 不遮蔽消费端 fallback：%s', (variables) => {
    expect(fixed(`<svg style="${variables};fill:var(--a,#abcdef)"/>`).properties.style).toBe('fill:#abcdef;background-color:#ffffff')
  })

  it('currentColor 仅替换颜色属性的颜色关键词，保留字体和 URL 标识符', () => {
    const svg = fixed('<svg><text font-family="CurrentColor" style="font-family:CurrentColor;fill:currentColor"/><path fill="url(#currentColor)"/></svg>')
    expect(child(svg).properties.fontFamily).toBe('CurrentColor')
    expect(child(svg).properties.style).toBe('font-family:CurrentColor;fill:#1f1f1f')
    expect(child(svg, 1).properties.fill).toBe('url(#currentColor)')
    const real = fixed(renderPele('flowchart TD\n A[字体]\n style A font-family:CurrentColor').svg)
    expect(JSON.stringify(real)).toContain('CurrentColor')
  })

  it('保留字体、自定义属性和 URL 中的函数字面量，忽略注释假引用', () => {
    const svg = parseSvg('<svg style="--literal:&quot;var(--missing)&quot;;--comment:#123456/*var(--comment)*/;font-family:var(--literal);fill:var(--comment)"><text font-family="&quot;color-mix(in srgb,red 50%,blue)&quot;"/><path fill="url(#var(--missing))"/></svg>')
    solidifyPeleSvgStyle(svg, resolvePeleTokens(''))
    expect(svg.properties.style).toBe('font-family:"var(--missing)";fill:#123456/*var(--comment)*/;background-color:#ffffff')
    expect(child(svg).properties.fontFamily).toBe('"color-mix(in srgb,red 50%,blue)"')
    expect(child(svg, 1).properties.fill).toBe('url(#var(--missing))')
  })

  it.each(['var(--missing)', 'color-mix(in srgb,red 50%,blue)'])('真实 Pele 输出保留引号字体字面量：%s', (font) => {
    const svg = parseSvg(renderPele('flowchart TD\n A[字体]').svg)
    sanitizeSvgElement(svg)
    solidifyPeleSvgStyle(svg, resolvePeleTokens('', `"${font}"`))
    expect(svg.properties.style).toContain(`font-family:"${font}"`)
  })

  it('fallback 引用也形成变量环，无效局部声明遮蔽父值且变量名区分大小写', () => {
    const svg = fixed('<svg style="--a:#123456;--A:#654321"><g style="--a:var(--A,var(--a))"><path fill="var(--a,#abcdef)" stroke="var(--A)"/></g></svg>')
    expect(child(child(svg)).properties).toMatchObject({ fill: '#abcdef', stroke: '#654321' })
  })

  it('currentColor 忽略大小写，color 自引用继承父级且内联样式优先', () => {
    const svg = fixed('<svg color="#123456"><g color="#abcdef" style="color:currentcolor"><path stroke="CurrentColor"/></g><g style="color:#abcdef"><path fill="currentColor"/></g></svg>')
    expect(child(child(svg)).properties.stroke).toBe('#123456')
    expect(child(child(svg, 1)).properties.fill).toBe('#abcdef')
  })

  it('先解析直接或变量引入的 currentColor 再执行颜色混合', () => {
    const svg = fixed('<svg color="#ffffff" style="--ink:currentColor"><path fill="color-mix(in srgb,currentColor 50%,#000)"/><path fill="color-mix(in srgb,var(--ink) 50%,#000)"/></svg>')
    expect(child(svg).properties.fill).toBe('#808080')
    expect(child(svg, 1).properties.fill).toBe('#808080')
  })

  it('只混合固定形态不透明 hex，保留普通颜色、opacity 和样式优先级', () => {
    const svg = fixed('<svg><rect fill="var(--pele-bg)" style="fill:rgb(1, 2, 3)!important;fill:red;stroke:color-mix(in srgb,#fff 50%,#000);opacity:0.5"/><text fill="hsl(10, 20%, 30%)"/><path stroke="red"/></svg>')
    expect(child(svg).properties.style).toBe('fill:rgb(1, 2, 3)!important;stroke:#808080;opacity:0.5')
    expect(child(svg, 1).properties.fill).toBe('hsl(10, 20%, 30%)')
    expect(child(svg, 2).properties.stroke).toBe('red')
    expect(() => fixed('<svg fill="color-mix(in srgb,red 50%,blue)"/>')).toThrow(/不支持的颜色混合/)
  })

  it('继承前移除变量不会改变后代，清洗后的恶意节点和 URL 不会复活', () => {
    const svg = fixed('<svg onload="alert(1)" style="--a:#123456"><script>alert(1)</script><a href="https://evil.test"><path fill="var(--a)" style="stroke:url(https://evil.test)"/></a></svg>')
    const serialized = JSON.stringify(svg)
    expect(serialized).not.toMatch(/onload|alert|evil\.test|var\(/)
    expect(child(child(svg)).properties.fill).toBe('#123456')
  })

  it('真实子图混合、图标 currentColor 输出能够固化', () => {
    const samples = [
      'architecture-beta title T\n service a(server)[A]\n service b "txt" [B]\n a:R --> L:b',
      'flowchart TB\n Outside[Outside]\n subgraph S0["这是一个用于遮盖所有连线入口的非常非常长的子图标题0"]\n N0[Node 0]\n end\n Outside --> N0',
    ]
    expect(renderPele(samples[0]).svg).toMatch(/currentColor/i)
    expect(renderPele(samples[1]).svg).toContain('color-mix(')
    for (const source of samples) {
      const svg = fixed(renderPele(source).svg, 'dark')
      expect(JSON.stringify(svg)).not.toMatch(/var\(|currentcolor|color-mix\(/i)
    }
  })
})

describe('pele 资源边界', () => {
  it('真实输入上限由上游拒绝', () => {
    expect(() => renderPele(`flowchart TD\n${' '.repeat(50001)}`, { limit: 50000 })).toThrow()
  })

  it('插件固定传入全部边界并把上游资源错误保留为错误 figure', async () => {
    const module = await import('pele')
    const spy = vi.spyOn(module, 'render')
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      for (const message of ['outputLimit exceeded', 'maxEdges exceeded']) {
        spy.mockImplementationOnce(() => {
          throw new Error(message)
        })
        const root = {
          type: 'root' as const,
          children: [{ type: 'element' as const, tagName: 'pre', properties: {}, children: [{ type: 'element' as const, tagName: 'code', properties: { className: ['language-mermaid'] }, children: [{ type: 'text' as const, value: 'flowchart TD\n A --> B' }] }] }],
        }
        const processor = unified().use(rehypeMermaid, { fontFamily: 'serif' }).use(rehypeStringify)
        const html = processor.stringify(await processor.run(root))
        expect(html).toContain('figure-mermaid-error')
        expect(html).toContain(message)
      }
      expect(spy).toHaveBeenCalledWith(expect.any(String), {
        fontFamily: 'serif',
        responsive: false,
        autoDirection: false,
        links: false,
        images: false,
        limit: 50000,
        outputLimit: 4000000,
        maxEdges: 5000,
      })
    }
    finally {
      spy.mockRestore()
      error.mockRestore()
    }
  })
})
