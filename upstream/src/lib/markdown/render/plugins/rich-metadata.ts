export interface RichMetadata {
  type: string
  hash: string
}

function stableHash(input: string): string {
  let hash = 2166136261
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

export function createRichMetadata(type: string, source: string): RichMetadata {
  return { type, hash: stableHash(`${type}:${source}`) }
}

export function richData(metadata: RichMetadata): Record<string, string> {
  return {
    'data-bm-rich': metadata.type,
    'data-bm-hash': metadata.hash,
  }
}
