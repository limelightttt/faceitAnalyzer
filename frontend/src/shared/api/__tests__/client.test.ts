import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { apiGet, apiPost, setCsrfToken } from '../client'
import { ApiError } from '../errors'
import { getConnectivity, reportServerReachable } from '../network'

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })

const fail = async (p: Promise<unknown>) => {
  try {
    await p
  } catch (e) {
    return e
  }
  throw new Error('expected a rejection')
}

describe('API client error classification', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    reportServerReachable()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
    fetchMock.mockReset()
  })

  it('tells FACEIT outages from our own server errors', async () => {
    fetchMock.mockResolvedValueOnce(json(503, { detail: 'FACEIT недоступен', source: 'faceit' }))
    const a = (await fail(apiGet('/x'))) as ApiError
    expect(a.kind).toBe('faceit_unavailable')
    fetchMock.mockResolvedValueOnce(json(500, { detail: 'boom' }))
    expect(((await fail(apiGet('/x'))) as ApiError).kind).toBe('server')
  })

  it('treats a proxy 502 without our JSON as "server unreachable"', async () => {
    fetchMock.mockResolvedValueOnce(new Response('<html>Bad gateway</html>', { status: 502, headers: { 'content-type': 'text/html' } }))
    expect(((await fail(apiGet('/x'))) as ApiError).kind).toBe('unreachable')
    expect(getConnectivity().serverReachable).toBe(false)
  })

  it('separates offline from an unreachable server and recovers on the next answer', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    expect(((await fail(apiGet('/x'))) as ApiError).kind).toBe('unreachable')
    vi.stubGlobal('navigator', { onLine: false })
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    expect(((await fail(apiGet('/x'))) as ApiError).kind).toBe('offline')
    fetchMock.mockResolvedValueOnce(json(200, { ok: true }))
    await apiGet('/x')
    expect(getConnectivity().serverReachable).toBe(true)
  })

  it('reads rate limits with their retry time', async () => {
    fetchMock.mockResolvedValueOnce(json(429, { detail: 'лимит', source: 'faceit' }, { 'Retry-After': '120' }))
    const e = (await fail(apiGet('/x'))) as ApiError
    expect(e.kind).toBe('rate_limited')
    expect(e.retryAfterS).toBe(120)
    expect(e.source).toBe('faceit')
  })

  it('passes caller cancellation through untouched (no false error)', async () => {
    fetchMock.mockImplementationOnce((_u: string, init: RequestInit) => new Promise((_r, reject) => init.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))))
    const ctrl = new AbortController()
    const p = apiGet('/x', ctrl.signal)
    ctrl.abort()
    const e = await fail(p)
    expect(e).toBeInstanceOf(DOMException)
    expect(e).not.toBeInstanceOf(ApiError)
  })

  it('gives up on a hung request after the generous timeout', async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementationOnce((_u: string, init: RequestInit) => new Promise((_r, reject) => init.signal!.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))))
    const p = fail(apiGet('/x'))
    await vi.advanceTimersByTimeAsync(179_000)
    let settled = false
    p.then(() => (settled = true))
    await Promise.resolve()
    expect(settled).toBe(false) // slow but legitimate requests are not cut short
    await vi.advanceTimersByTimeAsync(2_000)
    expect(((await p) as ApiError).kind).toBe('timeout')
  })

  it('refreshes a rotated CSRF token once and retries the action', async () => {
    setCsrfToken('old')
    fetchMock
      .mockResolvedValueOnce(json(403, { detail: 'CSRF-токен отсутствует или неверен' }))
      .mockResolvedValueOnce(json(200, { authenticated: true, csrf_token: 'new' }))
      .mockResolvedValueOnce(json(200, { saved: true }))
    await expect(apiPost('/me/settings', {})).resolves.toEqual({ saved: true })
    expect(fetchMock.mock.calls[2][1].headers['X-CSRF-Token']).toBe('new')
  })
})
