import { fileURLToPath } from 'node:url'
import { defineConfig } from 'tsdown/config'

const srcDir = fileURLToPath(new URL('./src', import.meta.url))

export default defineConfig({
  entry: {
    bmmd: 'src/cli/index.ts',
  },
  outDir: 'bin',
  format: 'esm',
  platform: 'node',
  target: 'node20',
  alias: {
    '@': srcDir,
  },
  clean: true,
  dts: false,
  sourcemap: false,
  minify: true,
  shims: true,
  css: {
    minify: true,
    target: false,
  },
  deps: {
    onlyBundle: false,
  },
})
