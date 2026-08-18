import { scalarConfig } from '@/config'

const SCALAR_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/@scalar/api-reference'
const SCALAR_SELECTOR = '#scalar-api-reference'
const SCALAR_LOAD_TIMEOUT_MS = 15_000

export type ScalarLoadState = 'ready' | 'error'

export interface ScalarReferenceInstance {
  destroy: () => void
}

export interface ScalarBrowserApi {
  createApiReference: (selector: string, config: {
    url: string
    theme?: string
    customCss?: string
  }) => ScalarReferenceInstance
}

interface ScalarContainer {
  replaceChildren: () => void
}

interface ScalarScript {
  src: string
  onload: ((event: Event) => unknown) | null
  onerror: ((event: Event) => unknown) | null
  remove: () => void
}

export interface ScalarLoaderDependencies {
  getContainer: () => ScalarContainer | null
  getApi: () => ScalarBrowserApi | null
  createScript: () => ScalarScript
  appendScript: (script: ScalarScript) => void
  schedule: (callback: () => void) => void
  setTimer: (callback: () => void, delay: number) => unknown
  clearTimer: (timer: unknown) => void
}

const browserDependencies: ScalarLoaderDependencies = {
  getContainer: () => document.querySelector(SCALAR_SELECTOR),
  getApi: () => {
    const scalar = window.Scalar
    return typeof scalar?.createApiReference === 'function' ? scalar : null
  },
  createScript: () => document.createElement('script'),
  appendScript: script => document.body.appendChild(script as HTMLScriptElement),
  schedule: callback => queueMicrotask(callback),
  setTimer: (callback, delay) => setTimeout(callback, delay),
  clearTimer: timer => clearTimeout(timer as ReturnType<typeof setTimeout>),
}

export function loadScalarReference(
  onStateChange: (state: ScalarLoadState) => void,
  dependencies: ScalarLoaderDependencies = browserDependencies,
): () => void {
  let isDisposed = false
  let isSettled = false
  let instance: ScalarReferenceInstance | null = null
  let script: ScalarScript | null = null
  let timer: unknown = null

  const container = dependencies.getContainer()
  if (!container) {
    return () => {}
  }

  container.replaceChildren()

  const clearLoadTimer = () => {
    if (timer === null) {
      return
    }
    dependencies.clearTimer(timer)
    timer = null
  }

  const removeScript = () => {
    if (!script) {
      return
    }
    script.onload = null
    script.onerror = null
    script.remove()
    script = null
  }

  const fail = () => {
    if (isDisposed || isSettled) {
      return
    }
    isSettled = true
    clearLoadTimer()
    removeScript()
    onStateChange('error')
  }

  const initialize = () => {
    if (isDisposed || isSettled) {
      return
    }

    const scalar = dependencies.getApi()
    if (!scalar) {
      fail()
      return
    }

    try {
      const nextInstance = scalar.createApiReference(SCALAR_SELECTOR, {
        url: scalarConfig.url,
        theme: scalarConfig.theme,
        customCss: scalarConfig.customCss,
      })

      if (isDisposed) {
        nextInstance.destroy()
        return
      }

      instance = nextInstance
      isSettled = true
      clearLoadTimer()
      onStateChange('ready')
    }
    catch {
      fail()
    }
  }

  timer = dependencies.setTimer(fail, SCALAR_LOAD_TIMEOUT_MS)

  if (dependencies.getApi()) {
    dependencies.schedule(initialize)
  }
  else {
    script = dependencies.createScript()
    script.src = SCALAR_SCRIPT_URL
    script.onload = initialize
    script.onerror = fail
    dependencies.appendScript(script)
  }

  return () => {
    isDisposed = true
    clearLoadTimer()
    removeScript()
    instance?.destroy()
    container.replaceChildren()
  }
}
