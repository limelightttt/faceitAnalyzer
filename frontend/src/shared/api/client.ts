import { ApiError, type ErrorSource, kindFromStatus } from './errors'
import { reportServerReachable, reportServerUnreachable } from './network'

export { ApiError } from './errors'

// Generous limits: a first load of 200 FACEIT matches legitimately takes ~2 minutes at the API rate limit.
// They only stop requests that would otherwise hang forever (e.g. a half-open connection).
const GET_TIMEOUT_MS = 180_000
const SEND_TIMEOUT_MS = 120_000

// CSRF synchronizer token from /api/auth/me; sent on unsafe methods. Session itself is an HttpOnly cookie
// that JavaScript never sees.
let csrfToken: string | null = null
export const setCsrfToken = (t: string | null) => {
  csrfToken = t
}

function retryAfter(headers: Headers | null): number | undefined {
  const v = headers?.get('Retry-After')
  if (!v) return undefined
  const s = Number(v)
  if (Number.isFinite(s)) return Math.max(0, Math.round(s))
  const at = Date.parse(v)
  return Number.isNaN(at) ? undefined : Math.max(0, Math.round((at - Date.now()) / 1000))
}

function errorFromBody(status: number, body: unknown, headers: Headers | null, fallback: string): ApiError {
  const b = (body ?? {}) as { detail?: unknown; source?: string }
  const detail = typeof b.detail === 'string' ? b.detail : b.detail ? JSON.stringify(b.detail) : fallback
  const source: ErrorSource = b.source === 'faceit' ? 'faceit' : 'app'
  // a response without our JSON body on 502/504 is a proxy speaking for a dead app
  const ours = typeof b.detail === 'string'
  return new ApiError(status, detail, {
    source,
    retryAfterS: retryAfter(headers),
    kind: !ours && (status === 502 || status === 504) ? 'unreachable' : kindFromStatus(status, source),
  })
}

async function parseError(res: Response): Promise<ApiError> {
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    /* non-JSON error */
  }
  return errorFromBody(res.status, body, res.headers, res.statusText || `HTTP ${res.status}`)
}

/** fetch with a hard timeout that keeps caller cancellation (React Query unmounts) distinguishable. */
async function request(path: string, init: RequestInit, timeoutMs: number, signal?: AbortSignal): Promise<Response> {
  const ctrl = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    ctrl.abort()
  }, timeoutMs)
  const onAbort = () => ctrl.abort()
  if (signal?.aborted) ctrl.abort()
  signal?.addEventListener('abort', onAbort)
  try {
    const res = await fetch(`/api${path}`, { ...init, credentials: 'same-origin', signal: ctrl.signal })
    const failed = !res.ok && (res.status === 502 || res.status === 504) && !res.headers.get('content-type')?.includes('json')
    if (failed) reportServerUnreachable()
    else reportServerReachable()
    return res
  } catch (e) {
    // cancelled by the caller: rethrow as-is so React Query treats it as a cancellation, not an error
    if (signal?.aborted) throw e
    if (timedOut) throw new ApiError(0, 'Превышено время ожидания ответа', { kind: 'timeout' })
    if (typeof navigator !== 'undefined' && !navigator.onLine) throw new ApiError(0, 'Нет подключения к интернету', { kind: 'offline' })
    reportServerUnreachable()
    throw new ApiError(0, 'Сервер приложения не отвечает', { kind: 'unreachable' })
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await request(path, {}, GET_TIMEOUT_MS, signal)
  if (!res.ok) throw await parseError(res)
  return res.json() as Promise<T>
}

async function refreshCsrf(): Promise<void> {
  try {
    const me = await apiGet<{ csrf_token?: string }>('/auth/me')
    csrfToken = me.csrf_token ?? null
  } catch {
    /* keep the old token */
  }
}

async function send<T>(method: string, path: string, body?: unknown, retried = false): Promise<T> {
  if (!csrfToken && !retried) await refreshCsrf()
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (csrfToken) headers['X-CSRF-Token'] = csrfToken
  const res = await request(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }, SEND_TIMEOUT_MS)
  if (!res.ok) {
    const err = await parseError(res)
    // the session (and its CSRF token) may have been rotated by a login in another tab: refresh once
    if (res.status === 403 && /CSRF/i.test(err.message) && !retried) {
      await refreshCsrf()
      return send<T>(method, path, body, true)
    }
    throw err
  }
  if (res.status === 204 || res.redirected || !res.headers.get('content-type')?.includes('json')) return undefined as T
  return res.json() as Promise<T>
}

export const apiPost = <T>(path: string, body?: unknown) => send<T>('POST', path, body)
export const apiPut = <T>(path: string, body?: unknown) => send<T>('PUT', path, body)
export const apiDelete = (path: string) => send<void>('DELETE', path)

/** Upload with real progress (fetch has no upload progress events). Abortable through `signal`. */
export async function apiUpload<T>(path: string, file: File, onProgress: (ratio: number) => void, signal?: AbortSignal): Promise<T> {
  if (!csrfToken) await refreshCsrf()
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `/api${path}`)
    if (csrfToken) xhr.setRequestHeader('X-CSRF-Token', csrfToken)
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total)
    xhr.onload = () => {
      reportServerReachable()
      let body: unknown = null
      try {
        body = JSON.parse(xhr.responseText)
      } catch {
        /* ignore */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as T)
      else {
        const headers = new Headers()
        const ra = xhr.getResponseHeader('Retry-After')
        if (ra) headers.set('Retry-After', ra)
        reject(errorFromBody(xhr.status, body, headers, xhr.statusText || `HTTP ${xhr.status}`))
      }
    }
    xhr.onerror = () => {
      if (!navigator.onLine) return reject(new ApiError(0, 'Нет подключения к интернету', { kind: 'offline' }))
      reportServerUnreachable()
      reject(new ApiError(0, 'Соединение с сервером прервалось во время загрузки', { kind: 'unreachable' }))
    }
    xhr.onabort = () => reject(new DOMException('Загрузка отменена', 'AbortError'))
    signal?.addEventListener('abort', () => xhr.abort(), { once: true })
    const form = new FormData()
    form.append('file', file)
    xhr.send(form)
  })
}
