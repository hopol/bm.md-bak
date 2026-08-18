import type { Plugin } from 'vite'
import { Buffer } from 'node:buffer'
import { transform } from 'lightningcss'

export function cssRawMinifyPlugin(): Plugin {
  return {
    name: 'css-raw-minify',
    enforce: 'post',
    transform(code, id) {
      const queryIndex = id.indexOf('?')
      if (queryIndex === -1 || !id.slice(0, queryIndex).endsWith('.css'))
        return

      const query = new URLSearchParams(id.slice(queryIndex + 1))
      if (!query.has('raw') && !query.has('inline'))
        return

      // Vite/tsdown 已将 CSS 转换为 export default "..."，这里做后压缩。
      const match = code.match(/^export default\s+("[\s\S]*")\s*;?/m)
      if (!match)
        return

      const css = JSON.parse(match[1]) as string

      const { code: minified } = transform({
        filename: id.slice(0, queryIndex),
        code: Buffer.from(css),
        minify: true,
      })

      return {
        code: `export default ${JSON.stringify(minified.toString())}`,
        map: null,
      }
    },
  }
}
