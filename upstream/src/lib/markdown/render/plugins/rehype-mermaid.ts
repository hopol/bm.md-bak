import { render as renderPele } from 'pele'
import { resolvePeleTokens } from '@/themes/mermaid-theme/tokens'
import { solidifyPeleSvgStyle } from './pele-svg-style'
import { createSvgRendererPlugin } from './rehype-svg-renderer'
import { makeSvgResponsive } from './svg-style'

export interface RehypeMermaidOptions {
  theme?: string
  /** 图表字体栈，来自 Markdown 排版风格的 diagramFontFamily；缺省保持库默认 */
  fontFamily?: string
}

const rehypeMermaid = createSvgRendererPlugin<RehypeMermaidOptions>({
  languageId: 'mermaid',
  figureClassName: 'figure-mermaid',
  render: async (code, options) => {
    return renderPele(code, {
      fontFamily: options.fontFamily,
      responsive: false,
      autoDirection: false,
      links: false,
      images: false,
      limit: 50000,
      outputLimit: 4000000,
      maxEdges: 5000,
    }).svg
  },
  adjustSvgStyle: (svgNode, options) => {
    solidifyPeleSvgStyle(svgNode, resolvePeleTokens(options.theme === 'dark' ? 'dark' : '', options.fontFamily))
    makeSvgResponsive(svgNode)
  },
})

export default rehypeMermaid
