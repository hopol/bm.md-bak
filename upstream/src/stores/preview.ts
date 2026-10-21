import type { InfographicPaletteId, InfographicThemeId } from '@/themes/infographic-theme'
import type { MarkdownStyleId } from '@/themes/markdown-style/metadata'
import type { MermaidThemeId } from '@/themes/mermaid-theme'
import { pick } from 'es-toolkit'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { codeThemeIds } from '@/themes/code-theme/metadata'
import { infographicPaletteIds, infographicThemeIds } from '@/themes/infographic-theme'
import { DEFAULT_MARKDOWN_STYLE_ID, markdownStyleIds } from '@/themes/markdown-style/metadata'
import { mermaidThemeIds } from '@/themes/mermaid-theme'

export const PREVIEW_WIDTH_MOBILE = 415
export const PREVIEW_WIDTH_DESKTOP = 768

export type PreviewWidth = typeof PREVIEW_WIDTH_MOBILE | typeof PREVIEW_WIDTH_DESKTOP
export type PreviewColorScheme = 'light' | 'dark'

export interface InfographicSettings {
  theme: InfographicThemeId
  palette: InfographicPaletteId
}

interface PreviewState {
  hasHydrated: boolean
  setHasHydrated: (value: boolean) => void

  renderedSignature: string | null
  setRenderedSignature: (signature: string | null) => void

  previewWidth: PreviewWidth
  setPreviewWidth: (width: PreviewWidth) => void

  previewColorScheme: PreviewColorScheme
  togglePreviewColorScheme: () => void

  markdownStyle: MarkdownStyleId
  setMarkdownStyle: (id: MarkdownStyleId) => void

  codeTheme: string
  setCodeTheme: (theme: string) => void

  mermaidTheme: MermaidThemeId
  setMermaidTheme: (theme: MermaidThemeId) => void

  infographic: InfographicSettings
  setInfographic: (settings: Partial<InfographicSettings>) => void

  customCss: string
  setCustomCss: (css: string) => void
}

const themeDefaults = {
  markdownStyle: DEFAULT_MARKDOWN_STYLE_ID,
  codeTheme: 'kimbie-light',
  mermaidTheme: '',
  infographic: { theme: 'default', palette: 'antv' },
} satisfies Pick<PreviewState, 'markdownStyle' | 'codeTheme' | 'mermaidTheme' | 'infographic'>

function resolveThemeId<T extends string>(value: unknown, ids: readonly T[], fallback: T): T {
  return typeof value === 'string' && ids.includes(value as T) ? value as T : fallback
}

export function partializePreviewState(state: PreviewState) {
  return {
    previewWidth: state.previewWidth,
    previewColorScheme: state.previewColorScheme,
    markdownStyle: state.markdownStyle,
    codeTheme: state.codeTheme,
    mermaidTheme: state.mermaidTheme,
    infographic: state.infographic,
    customCss: state.customCss,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isPreviewWidth(value: unknown): value is PreviewWidth {
  return value === PREVIEW_WIDTH_MOBILE || value === PREVIEW_WIDTH_DESKTOP
}

export function migratePreviewState(persistedState: unknown, version: number) {
  if (!isRecord(persistedState)) {
    return { previewWidth: PREVIEW_WIDTH_MOBILE }
  }

  const { userPreferredWidth, ...settings } = persistedState
  const width = version === 0 ? userPreferredWidth : settings.previewWidth
  const previewWidth = isPreviewWidth(width) ? width : PREVIEW_WIDTH_MOBILE

  const mermaidTheme = resolveThemeId(settings.mermaidTheme, mermaidThemeIds, themeDefaults.mermaidTheme)

  return {
    ...settings,
    previewWidth,
    mermaidTheme,
  }
}

export const usePreviewStore = create<PreviewState>()(
  persist(
    set => ({
      hasHydrated: false,
      setHasHydrated: hasHydrated => set({ hasHydrated }),

      renderedSignature: null,
      setRenderedSignature: renderedSignature => set({ renderedSignature }),

      previewWidth: PREVIEW_WIDTH_MOBILE,
      setPreviewWidth: previewWidth => set({ previewWidth }),

      previewColorScheme: 'light',
      togglePreviewColorScheme: () => set(state => ({
        previewColorScheme: state.previewColorScheme === 'dark' ? 'light' : 'dark',
      })),

      markdownStyle: themeDefaults.markdownStyle,
      setMarkdownStyle: markdownStyle => set({ markdownStyle }),

      codeTheme: themeDefaults.codeTheme,
      setCodeTheme: codeTheme => set({ codeTheme }),

      mermaidTheme: themeDefaults.mermaidTheme,
      setMermaidTheme: mermaidTheme => set({ mermaidTheme }),

      infographic: { ...themeDefaults.infographic },
      setInfographic: settings => set(state => ({
        infographic: { ...state.infographic, ...settings },
      })),

      customCss: '',
      setCustomCss: customCss => set({ customCss }),
    }),
    {
      name: 'bm.md.preview',
      version: 2,
      skipHydration: true,
      partialize: partializePreviewState,
      migrate: migratePreviewState,
      merge: (persistedState, currentState) => {
        if (!isRecord(persistedState)) {
          return currentState
        }
        const settings = persistedState as Partial<PreviewState>
        const infographic = isRecord(persistedState.infographic) ? persistedState.infographic : {}

        return {
          ...currentState,
          ...pick(settings, ['previewWidth', 'previewColorScheme', 'customCss']),
          markdownStyle: resolveThemeId(settings.markdownStyle, markdownStyleIds, themeDefaults.markdownStyle),
          codeTheme: resolveThemeId(settings.codeTheme, codeThemeIds, themeDefaults.codeTheme),
          mermaidTheme: resolveThemeId(settings.mermaidTheme, mermaidThemeIds, themeDefaults.mermaidTheme),
          infographic: {
            theme: resolveThemeId(infographic.theme, infographicThemeIds, themeDefaults.infographic.theme),
            palette: resolveThemeId(infographic.palette, infographicPaletteIds, themeDefaults.infographic.palette),
          },
        }
      },
      onRehydrateStorage: state => (rehydratedState, error) => {
        if (error) {
          console.error('Zustand preview rehydration error:', error)
        }
        const nextState = rehydratedState ?? state
        nextState.setHasHydrated(true)
      },
    },
  ),
)
