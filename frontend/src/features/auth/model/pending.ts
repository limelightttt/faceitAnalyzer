import { useSyncExternalStore } from 'react'

/** Sign-in is a full-page round trip to Steam/FACEIT, so the UI cannot animate "through" it. Instead the
 * app remembers that a sign-in was started (sessionStorage, this tab only) and, when it loads again,
 * shows "verifying" until the *server* confirms the session. `leaving` is in-memory: true only on the page
 * that is about to navigate to the provider. */
export type Provider = 'steam' | 'faceit'
export interface PendingLogin {
  provider: Provider
  at: number
}

const KEY = 'fi-auth-pending'
const MAX_AGE_MS = 15 * 60 * 1000 // provider "state" lives 10 min on the server; anything older is stale

function read(): PendingLogin | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as PendingLogin | null
    return v && Date.now() - v.at < MAX_AGE_MS ? v : null
  } catch {
    return null
  }
}

let pending = read()
let leaving = false
let snapshot = { pending, leaving }
const listeners = new Set<() => void>()
const emit = () => {
  snapshot = { pending, leaving }
  listeners.forEach((l) => l())
}

export function beginLogin(provider: Provider, href: string) {
  pending = { provider, at: Date.now() }
  leaving = true
  try {
    sessionStorage.setItem(KEY, JSON.stringify(pending))
  } catch {
    /* private mode: the verifying screen is skipped, sign-in itself still works */
  }
  emit()
  // let the "redirecting" state paint before the browser starts unloading the page
  requestAnimationFrame(() => requestAnimationFrame(() => window.location.assign(href)))
}

/** Resolve the pending sign-in (confirmed, failed or abandoned). */
export function finishLogin() {
  pending = null
  leaving = false
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
  emit()
}

if (typeof window !== 'undefined') {
  // Back button from the provider page restores this page from the bfcache in its "redirecting" state.
  window.addEventListener('pageshow', (e) => {
    if (e.persisted && leaving) finishLogin()
  })
}

export const usePendingLogin = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => snapshot,
  )

export interface AuthFailure {
  title: string
  hint: string
  kind: 'cancelled' | 'state' | 'allowlist' | 'unavailable' | 'linked' | 'other'
}

/** Turn the server's sign-in error (already human-readable) into a headline and advice. */
export function classifyAuthError(message: string): AuthFailure {
  const m = message.toLowerCase()
  if (/beta_allowlist|закрытая бета/.test(m))
    return { kind: 'allowlist', title: 'Доступ только по приглашению', hint: 'Этот аккаунт не в списке закрытой беты. Попросите владельца добавить ваш SteamID или ник FACEIT, либо войдите другим аккаунтом.' }
  if (/устарел|другом браузере|state/.test(m))
    return { kind: 'state', title: 'Вход нужно начать заново', hint: 'Ссылка входа одноразовая и действует несколько минут только в этом браузере.' }
  if (/недоступен|unavailable|timeout|502|503/.test(m))
    return { kind: 'unavailable', title: 'Провайдер входа не отвечает', hint: 'Steam или FACEIT сейчас недоступны. Попробуйте через минуту.' }
  if (/access_denied|не подтвердил вход|отмен|cancel/.test(m))
    return { kind: 'cancelled', title: 'Вход не завершён', hint: 'Похоже, вход был отменён на странице провайдера. Можно попробовать ещё раз.' }
  if (/уже привязан/.test(m)) return { kind: 'linked', title: 'Аккаунт уже используется', hint: 'Этот аккаунт привязан к другой учётной записи FACEIT Intelligence.' }
  return { kind: 'other', title: 'Не удалось войти', hint: 'Попробуйте ещё раз. Если ошибка повторяется — проверьте лог приложения.' }
}
