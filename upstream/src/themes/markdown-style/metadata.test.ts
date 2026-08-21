import { describe, expect, it } from 'vitest'
import { markdownStyleIds, markdownStyles } from './metadata'

const KEPT_STYLE_IDS = [
  'ayu-light',
  'bauhaus',
  'blueprint',
  'botanical',
  'kami',
  'neo-brutalism',
  'newsprint',
  'organic',
  'professional',
  'retro',
  'sketch',
  'terminal',
] as const

const REMOVED_STYLE_IDS = [
  'green-simple',
  'maximalism',
  'playful-geometric',
] as const

describe('markdown style 注册表', () => {
  it('保留 12 个主题且顺序不变', () => {
    expect(markdownStyleIds).toEqual([...KEPT_STYLE_IDS])
    expect(markdownStyles.map(style => style.id)).toEqual([...KEPT_STYLE_IDS])
  })

  it.each(REMOVED_STYLE_IDS)('注册列表不含已删除 ID %s', (id) => {
    expect(markdownStyleIds).not.toContain(id)
  })
})
