import type { DiagramColors, ThemeName } from 'beautiful-mermaid'
import { THEMES } from 'beautiful-mermaid'

export interface MermaidTheme {
  id: MermaidThemeId
  name: string
  isDark: boolean
}

/**
 * 将 kebab-case 的主题 ID 转换为 Title Case 显示名称
 * 例如: 'tokyo-night-storm' -> 'Tokyo Night Storm'
 */
function toDisplayName(id: string): string {
  return id
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/**
 * 根据主题颜色判断是否为深色主题
 * 通过背景色的亮度来判断
 */
function isDarkTheme(colors: DiagramColors): boolean {
  const bg = colors.bg
  // 解析十六进制颜色
  const hex = bg.replace('#', '')
  const r = Number.parseInt(hex.slice(0, 2), 16)
  const g = Number.parseInt(hex.slice(2, 4), 16)
  const b = Number.parseInt(hex.slice(4, 6), 16)
  // 计算相对亮度 (ITU-R BT.709)
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  return luminance < 0.5
}

// 从 THEMES 动态生成主题列表，按字母排序
const themesFromLib: MermaidTheme[] = (Object.keys(THEMES) as ThemeName[])
  .sort()
  .map(id => ({
    id,
    name: toDisplayName(id),
    isDark: isDarkTheme(THEMES[id]),
  }))

// 完整主题列表：默认主题 + 库主题
export const mermaidThemes: MermaidTheme[] = [
  { id: '', name: 'Default', isDark: false },
  ...themesFromLib,
]

// 所有有效的主题 ID（用于 zod schema）
export const mermaidThemeIds = mermaidThemes.map(t => t.id) as [string, ...string[]]

// 主题 ID 类型：空字符串（默认）或库中的主题名
export type MermaidThemeId = '' | ThemeName
