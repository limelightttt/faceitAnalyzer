import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/shared/api/errors'

import { AsyncView, type QueryState } from '../async-view'
import { LoadingSkeleton } from '../skeleton'

const q = <T,>(over: Partial<QueryState<T>>): QueryState<T> => ({ data: undefined, error: null, isPending: true, fetchStatus: 'fetching', refetch: vi.fn(), ...over })
const view = (query: QueryState<string>) =>
  render(
    <AsyncView query={query} notFound="Игрок не найден" skeleton={<LoadingSkeleton><div>SKELETON</div></LoadingSkeleton>}>
      {(d) => <div>DATA:{d}</div>}
    </AsyncView>,
  )

describe('AsyncView', () => {
  afterEach(() => vi.useRealTimers())

  it('reveals the skeleton only for slow requests', () => {
    vi.useFakeTimers()
    view(q({}))
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByText('SKELETON')).toBeNull() // no flash for fast responses
    act(() => vi.advanceTimersByTime(200))
    expect(screen.getByText('SKELETON')).toBeInTheDocument()
  })

  it('keeps data on screen when a background refresh fails', () => {
    view(q({ data: 'x', error: new ApiError(500, 'boom'), isPending: false, fetchStatus: 'idle' }))
    expect(screen.getByText('DATA:x')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows a waiting state instead of an endless skeleton when offline', () => {
    view(q({ fetchStatus: 'paused' }))
    expect(screen.getByText('Нет подключения к интернету')).toBeInTheDocument()
  })

  it('names what was not found and does not offer a pointless retry', () => {
    view(q({ error: new ApiError(404, 'Player not found'), isPending: false, fetchStatus: 'idle' }))
    expect(screen.getByText('Игрок не найден')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Повторить' })).toBeNull()
  })

  it('offers retry for transient failures', async () => {
    const refetch = vi.fn()
    view(q({ error: new ApiError(503, 'down', { source: 'faceit' }), isPending: false, fetchStatus: 'idle', refetch }))
    expect(screen.getByText('FACEIT временно недоступен')).toBeInTheDocument()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Повторить' })))
    expect(refetch).toHaveBeenCalledOnce()
  })
})
