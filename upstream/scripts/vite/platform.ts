import type { ProviderName } from 'std-env'

import { provider } from 'std-env'

export interface PlatformEnvironment {
  AliUid?: string
  EDGEONE_PROJECT_ID?: string
  EO_MAKERS?: string
}

export interface PlatformConfig {
  nitroPreset: string | undefined
  nitroUnenv: { external: string[] } | undefined
  prerender: boolean
  pwaOutDir: 'dist/client' | '.edgeone/assets' | '.output/public'
}

export function resolvePlatformConfig(
  environment: PlatformEnvironment,
  detectedProvider: ProviderName = provider,
): PlatformConfig {
  const isAliyunESA = Boolean(environment.AliUid)
  const isEdgeOneProvider = detectedProvider === 'edgeone_pages'
  const isTencentEdgeOne
    = isEdgeOneProvider
      || Boolean(environment.EDGEONE_PROJECT_ID)
      || Boolean(environment.EO_MAKERS)

  if (isAliyunESA) {
    return {
      nitroPreset: './preset/aliyun-esa/nitro.config.ts',
      nitroUnenv: undefined,
      prerender: true,
      pwaOutDir: 'dist/client',
    }
  }

  if (isTencentEdgeOne) {
    return {
      nitroPreset: isEdgeOneProvider ? undefined : 'edgeone-pages',
      nitroUnenv: undefined,
      prerender: false,
      pwaOutDir: '.edgeone/assets',
    }
  }

  return {
    nitroPreset: undefined,
    nitroUnenv: detectedProvider === 'cloudflare_workers'
      ? {
          // undici 会探测此模块；external 可避免 unenv shim 被编译成 undefined。
          external: ['node:worker_threads'],
        }
      : undefined,
    prerender: detectedProvider !== 'cloudflare_workers',
    pwaOutDir: '.output/public',
  }
}
