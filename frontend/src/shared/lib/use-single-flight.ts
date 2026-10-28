import { useCallback, useRef } from 'react'

/** Synchronous re-entrancy lock for user actions. React Query reports `isPending` on the next tick, so a
 * fast second click/Enter would otherwise start the same action twice. `run(fn)` ignores calls while the
 * previous promise is still pending. */
export function useSingleFlight() {
  const busy = useRef(false)
  return useCallback(<T,>(fn: () => Promise<T>) => {
    if (busy.current) return
    busy.current = true
    fn().then(
      () => (busy.current = false),
      () => (busy.current = false),
    )
  }, [])
}
