import { beforeEach, describe, expect, it, vi } from 'vitest'

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(), loading: vi.fn(), dismiss: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

import { ApiError } from '@/shared/api/errors'

import { notify } from '../notify'

describe('toast policy', () => {
  beforeEach(() => Object.values(toast).forEach((f) => f.mockReset()))

  it('leaves cancellations, connectivity and expired sessions to their own UI', () => {
    notify.apiError(new DOMException('x', 'AbortError'))
    notify.apiError(new ApiError(0, 'x', { kind: 'offline' }))
    notify.apiError(new ApiError(0, 'x', { kind: 'unreachable' }))
    notify.apiError(new ApiError(401, 'x'))
    expect(toast.error).not.toHaveBeenCalled()
    expect(toast.warning).not.toHaveBeenCalled()
  })

  it('collapses repeated rate-limit failures into one toast', () => {
    notify.apiError(new ApiError(429, 'a', { source: 'faceit' }))
    notify.apiError(new ApiError(429, 'b', { source: 'faceit' }))
    const ids = toast.warning.mock.calls.map((c) => c[1].id)
    expect(new Set(ids)).toEqual(new Set(['err:rate_limited']))
  })
})
