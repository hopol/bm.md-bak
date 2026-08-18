import { describe, expect, it } from 'vitest'

import { resolvePlatformConfig } from './platform'

describe('resolvePlatformConfig', () => {
  it('默认使用 Nitro 自动检测', () => {
    expect(resolvePlatformConfig({}, 'github_actions')).toEqual({
      nitroPreset: undefined,
      nitroUnenv: undefined,
      prerender: true,
      pwaOutDir: '.output/public',
    })
  })

  it('在 Cloudflare Workers Builds 关闭预渲染', () => {
    expect(resolvePlatformConfig({}, 'cloudflare_workers')).toEqual({
      nitroPreset: undefined,
      nitroUnenv: {
        external: ['node:worker_threads'],
      },
      prerender: false,
      pwaOutDir: '.output/public',
    })
  })

  it('存在 AliUid 时选择阿里云并保留预渲染与 PWA 输出目录', () => {
    expect(resolvePlatformConfig({ AliUid: '123' }, 'cloudflare_workers')).toEqual({
      nitroPreset: './preset/aliyun-esa/nitro.config.ts',
      nitroUnenv: undefined,
      prerender: true,
      pwaOutDir: 'dist/client',
    })
  })

  it('由 std-env 检测到腾讯 EdgeOne 时使用 Nitro 自动检测', () => {
    expect(resolvePlatformConfig({}, 'edgeone_pages')).toEqual({
      nitroPreset: undefined,
      nitroUnenv: undefined,
      prerender: false,
      pwaOutDir: '.edgeone/assets',
    })
  })

  it('存在 EDGEONE_PROJECT_ID 时回退识别腾讯 EdgeOne', () => {
    expect(resolvePlatformConfig({ EDGEONE_PROJECT_ID: 'project-id' }, 'cloudflare_workers')).toEqual({
      nitroPreset: 'edgeone-pages',
      nitroUnenv: undefined,
      prerender: false,
      pwaOutDir: '.edgeone/assets',
    })
  })

  it('存在 EO_MAKERS 时回退识别腾讯 EdgeOne', () => {
    expect(resolvePlatformConfig({ EO_MAKERS: 'true' }, 'cloudflare_workers')).toEqual({
      nitroPreset: 'edgeone-pages',
      nitroUnenv: undefined,
      prerender: false,
      pwaOutDir: '.edgeone/assets',
    })
  })

  it('edgeOne 回退变量为空字符串时不误判', () => {
    expect(
      resolvePlatformConfig({ EDGEONE_PROJECT_ID: '', EO_MAKERS: '' }, 'github_actions'),
    ).toEqual({
      nitroPreset: undefined,
      nitroUnenv: undefined,
      prerender: true,
      pwaOutDir: '.output/public',
    })
  })
})
