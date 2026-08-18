import { createMiddleware } from '@tanstack/react-start'
import { env } from '@/env'

function getConfiguredOrigin(configuredAppUrl: string | undefined): string | null {
  if (!configuredAppUrl) {
    return null
  }

  try {
    return new URL(configuredAppUrl).origin
  }
  catch {
    return null
  }
}

export function applyCors(
  request: Request,
  response?: Response,
  configuredAppUrl: string | undefined = env.VITE_APP_URL,
): Response {
  const result = request.method === 'OPTIONS'
    ? new Response(null, { status: 204 })
    : response ?? new Response(null)
  const origin = request.headers.get('Origin')

  if (!origin || origin === new URL(request.url).origin) {
    return result
  }

  const allowedOrigin = getConfiguredOrigin(configuredAppUrl)
  if (origin !== allowedOrigin) {
    return result
  }

  result.headers.set('Access-Control-Allow-Origin', allowedOrigin)
  result.headers.set('Access-Control-Allow-Credentials', 'true')
  result.headers.append('Vary', 'Origin')

  if (request.method === 'OPTIONS') {
    result.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
    result.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  }

  return result
}

export const corsMiddleware = createMiddleware().server(async ({ request, next }) => {
  if (request.method === 'OPTIONS') {
    return applyCors(request)
  }

  const result = await next()
  applyCors(request, result.response)
  return result
})
