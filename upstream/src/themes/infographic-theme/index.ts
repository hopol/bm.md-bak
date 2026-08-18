// @antv/infographic 的内置主题和色板列表
// 由于该库在 Node.js 环境下直接导入会出错，这里使用静态配置
// 数据来源：https://infographic.antv.vision/reference/built-in-themes
// https://infographic.antv.vision/reference/built-in-palettes

export interface InfographicTheme {
  id: string
  name: string
  isDark: boolean
}

export interface InfographicPalette {
  id: string
  name: string
}

/**
 * 将 kebab-case 的 ID 转换为 Title Case 显示名称
 * 例如: 'hand-drawn' -> 'Hand Drawn'
 */
function toDisplayName(id: string): string {
  return id
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

// 内置主题列表
// 来源: getThemes() 返回 ['default', 'dark', 'hand-drawn']
const BUILTIN_THEMES = ['default', 'dark', 'hand-drawn'] as const

// 内置色板列表
// 来源: getPalettes() 返回 { antv: [...], spectral: [...] }
const BUILTIN_PALETTES = ['antv', 'spectral'] as const

// 主题列表
export const infographicThemes: InfographicTheme[] = BUILTIN_THEMES.map(id => ({
  id,
  name: toDisplayName(id),
  isDark: id === 'dark',
}))

// 色板列表
export const infographicPalettes: InfographicPalette[] = BUILTIN_PALETTES.map(id => ({
  id,
  name: toDisplayName(id),
}))

// 主题 ID 列表（用于 zod schema）
export const infographicThemeIds = infographicThemes.map(t => t.id) as [string, ...string[]]

// 色板 ID 列表（用于 zod schema）
export const infographicPaletteIds = infographicPalettes.map(p => p.id) as [string, ...string[]]

// 主题 ID 类型
export type InfographicThemeId = (typeof infographicThemeIds)[number]

// 色板 ID 类型
export type InfographicPaletteId = (typeof infographicPaletteIds)[number]

/**
 * 验证主题 ID 是否有效
 */
export function isValidTheme(theme: string): theme is InfographicThemeId {
  return BUILTIN_THEMES.includes(theme as typeof BUILTIN_THEMES[number])
}

/**
 * 验证色板 ID 是否有效
 */
export function isValidPalette(palette: string): palette is InfographicPaletteId {
  return BUILTIN_PALETTES.includes(palette as typeof BUILTIN_PALETTES[number])
}
