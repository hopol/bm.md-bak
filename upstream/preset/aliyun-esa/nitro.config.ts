import type { NitroPreset } from 'nitro/types'
import { join } from 'node:path'

export default <NitroPreset>{
  extends: 'base-worker',
  minify: false,
  entry: join(__dirname, 'entry.ts'),
  output: {
    dir: 'dist',
    serverDir: 'dist/server',
    publicDir: 'dist/client',
  },
  commands: {
    preview: 'esa-cli dev',
  },
  wasm: { lazy: true },
  rollupConfig: {
    output: {
      format: 'module',
      entryFileNames: 'server.js',
      strictExecutionOrder: true,
    },
  },
}
