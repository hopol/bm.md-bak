export const mermaidThemeIds = ['', 'dark'] as const

export type MermaidThemeId = typeof mermaidThemeIds[number]

export interface MermaidTheme {
  id: MermaidThemeId
  name: string
  isDark: boolean
}

export const mermaidThemes: MermaidTheme[] = [
  { id: '', name: 'Default', isDark: false },
  { id: 'dark', name: 'Dark', isDark: true },
]
