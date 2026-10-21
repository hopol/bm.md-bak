import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_MARKDOWN_STYLE_ID } from '@/themes/markdown-style/metadata'
import {
  migratePreviewState,
  partializePreviewState,
  PREVIEW_WIDTH_DESKTOP,
  PREVIEW_WIDTH_MOBILE,
  usePreviewStore,
} from './preview'

describe('preview store 持久化', () => {
  it('默认使用 Kami 主题', () => {
    expect(usePreviewStore.getState().markdownStyle).toBe(DEFAULT_MARKDOWN_STYLE_ID)
  })

  it('持久化 previewWidth', () => {
    const persisted = partializePreviewState({
      ...usePreviewStore.getState(),
      previewWidth: PREVIEW_WIDTH_DESKTOP,
    })

    expect(persisted.previewWidth).toBe(PREVIEW_WIDTH_DESKTOP)
    expect(persisted).not.toHaveProperty('userPreferredWidth')
  })

  it.each([PREVIEW_WIDTH_MOBILE, PREVIEW_WIDTH_DESKTOP])(
    '迁移 v0 userPreferredWidth %i',
    (userPreferredWidth) => {
      expect(migratePreviewState({ userPreferredWidth, previewWidth: 500 }, 0)).toEqual({
        previewWidth: userPreferredWidth,
        mermaidTheme: '',
      })
    },
  )

  it.each([undefined, null, 0, 500, '768'])(
    '非法 v0 宽度 %s 回退为手机宽度并保留其他设置',
    (userPreferredWidth) => {
      expect(migratePreviewState({
        userPreferredWidth,
        previewWidth: PREVIEW_WIDTH_DESKTOP,
        previewColorScheme: 'dark',
        markdownStyle: 'custom',
      }, 0)).toEqual({
        previewWidth: PREVIEW_WIDTH_MOBILE,
        previewColorScheme: 'dark',
        markdownStyle: 'custom',
        mermaidTheme: '',
      })
    },
  )

  it.each([PREVIEW_WIDTH_MOBILE, PREVIEW_WIDTH_DESKTOP])(
    '保留 v1 previewWidth %i 并移除旧宽度字段',
    (previewWidth) => {
      expect(migratePreviewState({ previewWidth, userPreferredWidth: 500 }, 1)).toEqual({
        previewWidth,
        mermaidTheme: '',
      })
    },
  )

  it.each([undefined, null, 0, 500, '768'])(
    '非法 v1 宽度 %s 回退为手机宽度',
    (previewWidth) => {
      expect(migratePreviewState({ previewWidth }, 1)).toEqual({
        previewWidth: PREVIEW_WIDTH_MOBILE,
        mermaidTheme: '',
      })
    },
  )

  describe.each([0, 1])('v%i 主题迁移', (version) => {
    it.each(['', 'dark'])('保留合法主题 %s 及其他偏好', (mermaidTheme) => {
      const preferences = {
        previewColorScheme: 'dark',
        markdownStyle: 'custom',
        codeTheme: 'github-dark',
        infographic: { theme: 'dark', palette: 'antv' },
        customCss: '#bm-md { color: red; }',
      }

      expect(migratePreviewState({
        ...preferences,
        userPreferredWidth: PREVIEW_WIDTH_DESKTOP,
        previewWidth: PREVIEW_WIDTH_DESKTOP,
        mermaidTheme,
      }, version)).toEqual({
        ...preferences,
        previewWidth: PREVIEW_WIDTH_DESKTOP,
        mermaidTheme,
      })
    })

    it.each([undefined, null, 'github-dark', 'tokyo-night', 'default', 1])(
      '非法旧主题 %s 只复位为默认主题',
      (mermaidTheme) => {
        expect(migratePreviewState({
          userPreferredWidth: PREVIEW_WIDTH_DESKTOP,
          previewWidth: PREVIEW_WIDTH_DESKTOP,
          mermaidTheme,
          codeTheme: 'github-dark',
        }, version)).toEqual({
          previewWidth: PREVIEW_WIDTH_DESKTOP,
          mermaidTheme: '',
          codeTheme: 'github-dark',
        })
      },
    )
  })

  it.each([0, 1])('v%i 非对象状态回退为手机宽度', (version) => {
    for (const persistedState of [undefined, null, false, 0, 'settings']) {
      expect(migratePreviewState(persistedState, version)).toEqual({
        previewWidth: PREVIEW_WIDTH_MOBILE,
      })
    }
  })
})

describe('preview store 恢复主题', () => {
  let store: typeof usePreviewStore
  let initialState: ReturnType<typeof usePreviewStore.getState>
  let initialOptions: ReturnType<typeof usePreviewStore.persist.getOptions>
  let storage: Storage

  beforeEach(async () => {
    vi.resetModules()
    const values = new Map<string, string>()
    storage = {
      get length() { return values.size },
      clear: () => values.clear(),
      getItem: key => values.get(key) ?? null,
      key: index => [...values.keys()][index] ?? null,
      removeItem: key => values.delete(key),
      setItem: (key, value) => values.set(key, value),
    }
    vi.stubGlobal('localStorage', storage)
    vi.stubGlobal('window', { localStorage: storage })
    store = (await import('./preview')).usePreviewStore
    initialState = store.getState()
    initialOptions = store.persist.getOptions()
  })

  afterEach(() => {
    store.persist.setOptions(initialOptions)
    store.setState(initialState, true)
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  async function rehydrate(state: unknown, version = 2) {
    storage.setItem('bm.md.preview', JSON.stringify({ state, version }))
    await store.persist.rehydrate()
    expect(store.persist.hasHydrated()).toBe(true)
    expect(store.getState().hasHydrated).toBe(true)
    return store.getState()
  }

  const preferences = {
    previewWidth: PREVIEW_WIDTH_DESKTOP,
    previewColorScheme: 'dark',
    customCss: '#bm-md { color: red; }',
  }
  const validThemes = {
    markdownStyle: 'bauhaus',
    codeTheme: 'tokyo-night-dark',
    mermaidTheme: 'dark',
    infographic: { theme: 'hand-drawn', palette: 'spectral' },
  }

  it('当前 v2 非法主题回默认且保留其他偏好与 actions', async () => {
    const state = await rehydrate({
      ...preferences,
      markdownStyle: 'unknown',
      codeTheme: 'github-dark',
      mermaidTheme: 'default',
      infographic: { theme: 'unknown', palette: 'unknown' },
      setCodeTheme: null,
    })

    expect(partializePreviewState(state)).toEqual({
      ...preferences,
      markdownStyle: DEFAULT_MARKDOWN_STYLE_ID,
      codeTheme: 'kimbie-light',
      mermaidTheme: '',
      infographic: { theme: 'default', palette: 'antv' },
    })
    expect(state.setCodeTheme).toBe(initialState.setCodeTheme)
    state.setCodeTheme('panda-syntax-light')
    expect(store.getState().codeTheme).toBe('panda-syntax-light')
  })

  it('当前 v2 合法主题与非主题偏好全部保留', async () => {
    const state = await rehydrate({ ...preferences, ...validThemes })
    expect(partializePreviewState(state)).toEqual({ ...preferences, ...validThemes })
  })

  it.each([
    [{ theme: 'dark', palette: 'unknown' }, { theme: 'dark', palette: 'antv' }],
    [{ theme: 'unknown', palette: 'spectral' }, { theme: 'default', palette: 'spectral' }],
  ])('信息图设置 %j 逐字段恢复', async (infographic, expected) => {
    const state = await rehydrate({ ...validThemes, infographic })
    expect(state.infographic).toEqual(expected)
    expect(state.markdownStyle).toBe(validThemes.markdownStyle)
    expect(state.codeTheme).toBe(validThemes.codeTheme)
    expect(state.mermaidTheme).toBe(validThemes.mermaidTheme)
  })

  it.each([undefined, null, false, 42, 'dark', []])('缺失或非对象信息图 %j 回默认对象', async (infographic) => {
    const state = await rehydrate({ ...preferences, ...validThemes, infographic })
    expect(state.infographic).toEqual({ theme: 'default', palette: 'antv' })
    expect(state.customCss).toBe(preferences.customCss)
  })

  it.each([0, 1])('v%i 先迁移宽度再校验主题', async (version) => {
    const state = await rehydrate({
      ...preferences,
      ...validThemes,
      previewWidth: version === 0 ? 500 : PREVIEW_WIDTH_DESKTOP,
      userPreferredWidth: PREVIEW_WIDTH_DESKTOP,
      codeTheme: 'unknown',
    }, version)
    expect(partializePreviewState(state)).toEqual({
      ...preferences,
      ...validThemes,
      codeTheme: 'kimbie-light',
    })
  })
})
