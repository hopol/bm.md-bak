import type { MermaidThemeId } from './index'

const light = {
  '--pele-bg': '#ffffff',
  '--pele-fg': '#1f1f1f',
  '--pele-muted': '#6e6e6e',
  '--pele-line': '#1f1f1f',
  '--pele-surface': '#f3f3f3',
  '--pele-surface-alt': '#e6e6e6',
  '--pele-border': '#8a8a8a',
  '--pele-accent': '#5b7bd5',
  '--pele-critical': '#e45756',
  '--pele-series-1': '#4c78a8',
  '--pele-series-2': '#f58518',
  '--pele-series-3': '#54a24b',
  '--pele-series-4': '#e45756',
  '--pele-series-5': '#72b7b2',
  '--pele-series-6': '#eeca3b',
  '--pele-series-7': '#b279a2',
  '--pele-series-8': '#9d755d',
  '--pele-font': 'sans-serif',
  '--pele-font-mono': 'monospace',
  '--pele-radius': '4px',
  '--pele-title-weight': 'bold',
  '--pele-heading-weight': 'bold',
  '--pele-bold-weight': 'bold',
} as const

const dark: Record<keyof typeof light, string> = {
  ...light,
  '--pele-bg': '#18181b',
  '--pele-fg': '#f4f4f5',
  '--pele-muted': '#a1a1aa',
  '--pele-line': '#e4e4e7',
  '--pele-surface': '#27272a',
  '--pele-surface-alt': '#3f3f46',
  '--pele-border': '#a1a1aa',
  '--pele-accent': '#93b4ff',
  '--pele-critical': '#ff8585',
  '--pele-series-1': '#8fb9e3',
  '--pele-series-2': '#ffb86b',
  '--pele-series-3': '#8bd17c',
  '--pele-series-4': '#ff8585',
  '--pele-series-5': '#8ed5cf',
  '--pele-series-6': '#f4dc73',
  '--pele-series-7': '#d6a3c9',
  '--pele-series-8': '#cba58b',
}

export function resolvePeleTokens(theme: MermaidThemeId = '', fontFamily = 'sans-serif'): Record<string, string> {
  return { ...(theme === 'dark' ? dark : light), '--pele-font': fontFamily }
}
