import type { PageMeta } from '@/lib/seo'
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { createPageHead } from '@/lib/seo'

import { loadScalarReference } from './-docs-scalar-loader'

type LoadState = 'loading' | 'ready' | 'error'

export const Route = createFileRoute('/docs')({
  loader: () => {
    const meta: PageMeta = {
      title: 'API 文档',
    }
    return { meta }
  },
  head: ({ loaderData, match }) => loaderData
    ? createPageHead({ pathname: match.pathname, meta: loaderData.meta })
    : {},
  component: ApiReferencePage,
})

function ApiReferencePage() {
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [loadAttempt, setLoadAttempt] = useState(0)
  const retryButtonRef = useRef<HTMLButtonElement>(null)
  const shouldRestoreRetryFocusRef = useRef(false)

  useEffect(() => loadScalarReference(setLoadState), [loadAttempt])

  useEffect(() => {
    if (loadState === 'ready') {
      shouldRestoreRetryFocusRef.current = false
      return
    }

    if (loadState === 'error' && shouldRestoreRetryFocusRef.current) {
      shouldRestoreRetryFocusRef.current = false
      retryButtonRef.current?.focus()
    }
  }, [loadState])

  const retry = () => {
    shouldRestoreRetryFocusRef.current = true
    setLoadState('loading')
    setLoadAttempt(attempt => attempt + 1)
  }

  return (
    <main className="min-h-dvh bg-background" aria-busy={loadState === 'loading'}>
      {loadState === 'loading' && (
        <div className="flex min-h-dvh items-center justify-center p-4">
          <p role="status" className="text-xs text-muted-foreground">
            正在加载 API 文档…
          </p>
        </div>
      )}
      {loadState === 'error' && (
        <div className="flex min-h-dvh items-center justify-center p-4">
          <div
            role="alert"
            className="flex flex-col items-center gap-3 text-center"
          >
            <div className="space-y-1">
              <p className="text-sm font-medium">API 文档加载失败</p>
              <p className="text-xs text-muted-foreground">请检查网络连接后重试。</p>
            </div>
            <Button ref={retryButtonRef} type="button" variant="outline" size="sm" onClick={retry}>
              重新加载
            </Button>
          </div>
        </div>
      )}
      <div
        id="scalar-api-reference"
        className={loadState === 'ready' ? 'min-h-dvh' : 'hidden'}
      />
    </main>
  )
}
