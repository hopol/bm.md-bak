import type { ThemeName } from 'beautiful-mermaid'
import { renderMermaid, THEMES } from 'beautiful-mermaid'
import { createSvgRendererPlugin } from './rehype-svg-renderer'
import { makeSvgResponsive } from './svg-style'

export interface RehypeMermaidOptions {
  theme?: string
}

function isValidTheme(theme: string): theme is ThemeName {
  return theme !== '' && theme in THEMES
}

const rehypeMermaid = createSvgRendererPlugin<RehypeMermaidOptions>({
  languageId: 'mermaid',
  figureClassName: 'figure-mermaid',
  render: async (code, options) => {
    const themeColors = options.theme && isValidTheme(options.theme)
      ? THEMES[options.theme]
      : undefined
    return renderMermaid(code, themeColors)
  },
  adjustSvgStyle: makeSvgResponsive,
})

export default rehypeMermaid
