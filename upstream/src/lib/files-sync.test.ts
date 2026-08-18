import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  FILES_SIGNAL_KEY,
  parseFilesSignal,
  publishCatalogSignal,
  publishContentSignal,
} from './files-sync'

describe('files-sync', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', { setItem: vi.fn() })
  })

  it('解析 catalog/content 判别联合并忽略损坏值', () => {
    expect(parseFilesSignal('{"kind":"catalog","revision":2,"nonce":"n"}')).toEqual({ kind: 'catalog', revision: 2, nonce: 'n' })
    expect(parseFilesSignal('{"kind":"content","fileId":"one","version":3,"nonce":"n"}')).toEqual({ kind: 'content', fileId: 'one', version: 3, nonce: 'n' })
    expect(parseFilesSignal('{"revision":2,"nonce":"n"}')).toBeNull()
    expect(parseFilesSignal('{"kind":"content","fileId":"one","version":"3","nonce":"n"}')).toBeNull()
    expect(parseFilesSignal('损坏')).toBeNull()
  })

  it('发布 catalog 和 content 通知', () => {
    vi.spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000001')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000002')
    publishCatalogSignal(7)
    publishContentSignal('one', 8)
    expect(localStorage.setItem).toHaveBeenNthCalledWith(
      1,
      FILES_SIGNAL_KEY,
      JSON.stringify({ kind: 'catalog', revision: 7, nonce: '00000000-0000-4000-8000-000000000001' }),
    )
    expect(localStorage.setItem).toHaveBeenNthCalledWith(
      2,
      FILES_SIGNAL_KEY,
      JSON.stringify({ kind: 'content', fileId: 'one', version: 8, nonce: '00000000-0000-4000-8000-000000000002' }),
    )
  })
})
