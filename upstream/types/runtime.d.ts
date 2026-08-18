/* eslint-disable no-var */

declare var EdgeKV: EdgeKVConstructor
declare var edgeKVCache: Record<string, string> | undefined

declare module 'node_modules/.nitro/vite/services/ssr/index.js' {
  interface NitroSsrServer {
    fetch: (request: Request) => Promise<Response>
  }

  const server: NitroSsrServer
  export default server
}

interface EdgeKVOptions {
  namespace: string
}

interface EdgeKVGetOptions {
  type: 'text'
}

interface EdgeKVClient {
  get: (key: string, options: EdgeKVGetOptions) => Promise<string | null>
}

interface EdgeKVConstructor {
  new (options: EdgeKVOptions): EdgeKVClient
}
