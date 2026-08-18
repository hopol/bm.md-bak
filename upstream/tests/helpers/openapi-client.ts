import { handler } from '@/lib/markdown/api'

async function dispatchRequest(path: string, init: RequestInit = {}) {
  const request = new Request(`http://localhost${path}`, init)

  return await handler.handle(request, {
    prefix: '/api',
    context: { headers: request.headers },
  })
}

function postJson(path: string, body: unknown) {
  return dispatchRequest(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function postRaw(path: string, body: string, contentType = 'application/json') {
  return dispatchRequest(path, {
    method: 'POST',
    headers: { 'content-type': contentType },
    body,
  })
}

export const openApiClient = {
  request: dispatchRequest,
  postJson,
  postRaw,
}
