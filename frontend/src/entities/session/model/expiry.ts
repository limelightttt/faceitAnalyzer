import { useSyncExternalStore } from 'react'

/** Set when a signed-in session stops being valid mid-use, so the sign-in screen can say why it appeared. */
let expired = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export const markSessionExpired = () => {
  expired = true
  emit()
}
export const clearSessionExpired = () => {
  if (!expired) return
  expired = false
  emit()
}
export const useSessionExpired = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => expired,
  )
