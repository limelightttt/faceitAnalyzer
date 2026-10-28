import { afterEach, describe, expect, it, vi } from 'vitest'

import { isChunkLoadError, lazyPage } from '../lazy-route'

const Page = () => null
const chunkError = () => new TypeError('Failed to fetch dynamically imported module: /assets/index-abc.js')

describe('lazyPage', () => {
  afterEach(() => {
    sessionStorage.clear()
    vi.unstubAllGlobals()
  })

  it('returns the page component', async () => {
    await expect(lazyPage(async () => ({ Page }), (m) => m.Page)()).resolves.toEqual({ Component: Page })
  })

  it('reloads once when a rebuilt app no longer has the old chunk, and never loops', async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    const failing = lazyPage(() => Promise.reject(chunkError()), () => Page)
    void failing() // first failure online: reload and keep waiting
    await Promise.resolve()
    await Promise.resolve()
    expect(reload).toHaveBeenCalledOnce()
    await expect(failing()).rejects.toThrow(/dynamically imported module/) // after the reload: show the error screen
    expect(reload).toHaveBeenCalledOnce()
  })

  it('does not reload while offline: the error screen waits for the connection', async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    vi.stubGlobal('navigator', { onLine: false })
    await expect(lazyPage(() => Promise.reject(chunkError()), () => Page)()).rejects.toSatisfy(isChunkLoadError)
    expect(reload).not.toHaveBeenCalled()
  })
})
