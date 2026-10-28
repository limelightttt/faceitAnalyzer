import { useSyncExternalStore } from 'react'

/** Connectivity as the app experiences it. `navigator.onLine` only says a network interface is up, so the
 * reachability of *this* server is tracked separately from real request outcomes and a light health probe. */
export interface Connectivity {
  online: boolean
  serverReachable: boolean
}

let state: Connectivity = { online: typeof navigator === 'undefined' ? true : navigator.onLine, serverReachable: true }
const listeners = new Set<() => void>()
let probe: ReturnType<typeof setTimeout> | null = null
let probeDelay = 3000

function set(next: Partial<Connectivity>) {
  const merged = { ...state, ...next }
  if (merged.online === state.online && merged.serverReachable === state.serverReachable) return
  state = merged
  listeners.forEach((l) => l())
}

function scheduleProbe() {
  if (probe || typeof window === 'undefined') return
  probe = setTimeout(async () => {
    probe = null
    if (!state.online) return // the "online" event restarts probing
    try {
      const res = await fetch('/api/health', { cache: 'no-store', credentials: 'same-origin' })
      if (res.ok) return reportServerReachable()
    } catch {
      /* still down */
    }
    probeDelay = Math.min(probeDelay * 1.5, 15000)
    scheduleProbe()
  }, probeDelay)
}

/** Ask the server right now (the "Проверить" button); resolves to whether it answered. */
export async function checkServerNow(): Promise<boolean> {
  try {
    const res = await fetch('/api/health', { cache: 'no-store', credentials: 'same-origin' })
    if (res.ok) {
      reportServerReachable()
      return true
    }
  } catch {
    /* still down */
  }
  return false
}

/** Any response from our server proves it is reachable. */
export function reportServerReachable() {
  probeDelay = 3000
  set({ serverReachable: true })
}

/** A request could not reach our server although the device is online. */
export function reportServerUnreachable() {
  set({ serverReachable: false })
  scheduleProbe()
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    set({ online: true })
    if (!state.serverReachable) scheduleProbe()
  })
  window.addEventListener('offline', () => set({ online: false }))
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export const getConnectivity = () => state
export const subscribeConnectivity = subscribe
export const useConnectivity = () => useSyncExternalStore(subscribe, getConnectivity, getConnectivity)
