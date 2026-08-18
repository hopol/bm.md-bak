import { describe, expect, it } from 'vitest'
import { applyCors } from './cors'

const appUrl = 'https://app.example/path'

function request(method: string, origin?: string) {
  return new Request('https://api.example/api/upload/image', {
    method,
    headers: origin ? { Origin: origin } : undefined,
  })
}

describe('上传 CORS', () => {
  it('允许配置应用 Origin 并携带凭据', () => {
    const response = applyCors(request('POST', 'https://app.example'), Response.json({ ok: true }), appUrl)

    expect(response.headers.get('access-control-allow-origin')).toBe('https://app.example')
    expect(response.headers.get('access-control-allow-credentials')).toBe('true')
    expect(response.headers.get('vary')).toContain('Origin')
  })

  it('拒绝不匹配的 Origin', () => {
    const response = applyCors(request('POST', 'https://evil.example'), Response.json({ ok: true }), appUrl)

    expect(response.headers.get('access-control-allow-origin')).toBeNull()
    expect(response.headers.get('access-control-allow-credentials')).toBeNull()
  })

  it.each([
    ['未配置', undefined],
    ['非法配置', 'not a url'],
  ])('%s时不反射请求 Origin', (_name, configuredUrl) => {
    const response = applyCors(request('POST', 'https://evil.example'), Response.json({ ok: true }), configuredUrl)

    expect(response.headers.get('access-control-allow-origin')).toBeNull()
    expect(response.headers.get('access-control-allow-credentials')).toBeNull()
  })

  it('同源 POST 不添加不必要的跨域响应头', () => {
    const response = applyCors(
      request('POST', 'https://api.example'),
      Response.json({ ok: true }),
      appUrl,
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('允许的 OPTIONS 返回预检响应头', () => {
    const response = applyCors(request('OPTIONS', 'https://app.example'), undefined, appUrl)

    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBe('https://app.example')
    expect(response.headers.get('access-control-allow-methods')).toContain('POST')
    expect(response.headers.get('access-control-allow-headers')).toContain('Content-Type')
  })

  it('拒绝的 OPTIONS 不返回跨域响应头', () => {
    const response = applyCors(request('OPTIONS', 'https://evil.example'), undefined, appUrl)

    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBeNull()
    expect(response.headers.get('access-control-allow-credentials')).toBeNull()
  })
})
