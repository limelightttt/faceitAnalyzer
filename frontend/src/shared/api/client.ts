export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

// CSRF synchronizer token from /api/auth/me; sent on unsafe methods. Session itself is an HttpOnly cookie
// that JavaScript never sees.
let csrfToken: string | null = null
export const setCsrfToken = (t: string | null) => {
  csrfToken = t
}

async function parseError(res: Response): Promise<ApiError> {
  let detail = res.statusText
  try {
    const body = await res.json()
    detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail)
  } catch {
    /* non-JSON error */
  }
  return new ApiError(res.status, detail)
}

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`/api${path}`, { signal, credentials: 'same-origin' })
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
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    credentials: 'same-origin',
    body: body === undefined ? undefined : JSON.stringify(body),
  })
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

/** Upload with progress (fetch has no upload progress events). */
export async function apiUpload<T>(path: string, file: File, onProgress: (ratio: number) => void): Promise<T> {
  if (!csrfToken) await refreshCsrf()
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `/api${path}`)
    if (csrfToken) xhr.setRequestHeader('X-CSRF-Token', csrfToken)
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total)
    xhr.onload = () => {
      let body: unknown = null
      try {
        body = JSON.parse(xhr.responseText)
      } catch {
        /* ignore */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as T)
      else reject(new ApiError(xhr.status, (body as { detail?: string })?.detail ?? xhr.statusText))
    }
    xhr.onerror = () => reject(new ApiError(0, 'Сеть недоступна'))
    const form = new FormData()
    form.append('file', file)
    xhr.send(form)
  })
}
