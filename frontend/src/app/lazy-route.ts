import type { ComponentType } from 'react'

const RELOAD_KEY = 'fi-chunk-reload'

/** Loads a page chunk. If the browser is online but the chunk is gone, the app was rebuilt while this tab was
 * open (e.g. start.cmd after git pull): reload once to pick up the new build. Offline failures surface to
 * the route error screen, which reopens the page when the connection returns. */
export function lazyPage<M>(load: () => Promise<M>, pick: (m: M) => ComponentType) {
  return async () => {
    try {
      const m = await load()
      try {
        sessionStorage.removeItem(RELOAD_KEY)
      } catch {
        /* ignore */
      }
      return { Component: pick(m) }
    } catch (e) {
      let reloaded = true
      try {
        reloaded = sessionStorage.getItem(RELOAD_KEY) === '1'
        if (navigator.onLine && !reloaded) sessionStorage.setItem(RELOAD_KEY, '1')
      } catch {
        /* storage unavailable: never loop */
      }
      if (navigator.onLine && !reloaded) {
        window.location.reload()
        await new Promise(() => {}) // keep the current page until the reload happens
      }
      throw e
    }
  }
}

export const isChunkLoadError = (e: unknown) =>
  e instanceof Error && /dynamically imported module|Importing a module script failed|error loading dynamically imported|Loading chunk/i.test(e.message)
