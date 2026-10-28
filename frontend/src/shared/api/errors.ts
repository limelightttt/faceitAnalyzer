/** One classification of failures for the whole app: the API client creates it, every error state, toast
 * and banner reads it. Messages are written for people, never raw JSON or stack traces. */
export type ApiErrorKind =
  | 'offline' // the device has no network
  | 'unreachable' // network is up but the FACEIT Intelligence server does not answer
  | 'timeout' // request took longer than the client allows
  | 'unauthorized' // 401: session expired or missing
  | 'forbidden' // 403: no access (CSRF, allowlist, someone else's resource)
  | 'not_found'
  | 'conflict'
  | 'invalid' // 400/413/422: the request itself is wrong
  | 'rate_limited' // 429 (FACEIT quota or our own login limiter)
  | 'faceit_unavailable' // FACEIT answered with an error / is down
  | 'server' // unexpected error in this server

export type ErrorSource = 'faceit' | 'app'

export class ApiError extends Error {
  readonly kind: ApiErrorKind
  readonly retryAfterS?: number
  readonly source: ErrorSource

  constructor(
    public status: number,
    message: string,
    opts: { kind?: ApiErrorKind; retryAfterS?: number; source?: ErrorSource } = {},
  ) {
    super(message)
    this.name = 'ApiError'
    this.source = opts.source ?? 'app'
    this.kind = opts.kind ?? kindFromStatus(status, this.source)
    this.retryAfterS = opts.retryAfterS
  }
}

export function kindFromStatus(status: number, source: ErrorSource = 'app'): ApiErrorKind {
  if (status === 0) return 'unreachable'
  if (status === 401) return 'unauthorized'
  if (status === 403) return 'forbidden'
  if (status === 404) return 'not_found'
  if (status === 409) return 'conflict'
  if (status === 429) return 'rate_limited'
  if (status === 408) return 'timeout'
  if (status < 500) return 'invalid'
  if (source === 'faceit') return 'faceit_unavailable'
  // 502/504 without our JSON body come from a proxy in front of the app (Vite dev, Tailscale): app is down
  if (status === 502 || status === 504) return 'unreachable'
  return 'server'
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError
export const errorKind = (e: unknown): ApiErrorKind | null => (isApiError(e) ? e.kind : null)

/** Conditions shown by the connection banner rather than per request. */
export const isConnectivityError = (e: unknown) => {
  const k = errorKind(e)
  return k === 'offline' || k === 'unreachable'
}

export interface ErrorCopy {
  title: string
  message: string
  /** a retry can plausibly succeed */
  retryable: boolean
}

const until = (s?: number) => {
  if (!s) return ''
  const at = new Date(Date.now() + s * 1000).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  return s < 90 ? ` Повторить можно через ${s} с.` : ` Повторить можно после ${at}.`
}

/** Human copy for an error. `subject` lets a screen say what was not found ("Игрок не найден"). */
export function describeError(error: unknown, subject?: { notFound?: string }): ErrorCopy {
  if (!isApiError(error)) {
    const message = typeof error === 'string' ? error : 'Что-то пошло не так. Попробуйте ещё раз.'
    return { title: 'Не удалось выполнить действие', message, retryable: true }
  }
  const detail = error.message
  switch (error.kind) {
    case 'offline':
      return { title: 'Нет подключения к интернету', message: 'Проверьте сеть — как только связь появится, данные обновятся сами.', retryable: true }
    case 'unreachable':
      return { title: 'Сервер FACEIT Intelligence недоступен', message: 'Приложение на компьютере не отвечает. Убедитесь, что оно запущено (start.cmd / make serve).', retryable: true }
    case 'timeout':
      return { title: 'Ответ не пришёл вовремя', message: 'Сервер или FACEIT отвечают слишком долго. Обычно помогает повторить запрос чуть позже.', retryable: true }
    case 'unauthorized':
      return { title: 'Нужно войти', message: 'Сессия закончилась. Войдите снова — данные сохранены.', retryable: false }
    case 'forbidden':
      return { title: 'Нет доступа', message: detail || 'У этого аккаунта нет доступа к разделу.', retryable: false }
    case 'not_found':
      // the screen names what is missing; the server's sentence would only repeat it
      return subject?.notFound
        ? { title: subject.notFound, message: 'Проверьте ссылку или написание — регистр букв не важен.', retryable: false }
        : { title: 'Не найдено', message: detail || 'Проверьте ссылку или ник.', retryable: false }
    case 'conflict':
      return { title: 'Действие сейчас невозможно', message: detail, retryable: false }
    case 'invalid':
      return { title: 'Запрос не принят', message: detail, retryable: false }
    case 'rate_limited':
      return {
        title: error.source === 'faceit' ? 'Лимит запросов FACEIT' : 'Слишком много запросов',
        message: (error.source === 'faceit' ? 'FACEIT временно ограничил запросы. Уже загруженные данные доступны из кэша.' : 'Подождите немного.') + until(error.retryAfterS),
        retryable: true,
      }
    case 'faceit_unavailable':
      return { title: 'FACEIT временно недоступен', message: detail || 'FACEIT не ответил. Попробуйте позже.', retryable: true }
    default:
      return { title: 'Ошибка на сервере', message: 'Сервер не смог обработать запрос. Подробности — в логе приложения.', retryable: true }
  }
}
