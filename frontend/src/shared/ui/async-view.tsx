import { type ReactNode, useRef } from 'react'

import { cn } from '@/shared/lib/cn'

import { ErrorState, OfflineState } from './states'

/** The subset of a TanStack Query result the view needs. */
export interface QueryState<T> {
  data: T | undefined
  error: unknown
  isPending: boolean
  fetchStatus: 'fetching' | 'paused' | 'idle'
  refetch: () => unknown
}

/** Loading → content / error / offline for one query, the same way on every screen:
 *  - data on screen always wins: background refetches and their failures never blank it;
 *  - first load shows the skeleton (which itself appears only for slow requests);
 *  - offline with nothing cached shows a waiting state instead of an endless skeleton;
 *  - content that arrives after a wait fades in; cached content renders instantly. */
export function AsyncView<T>({
  query,
  skeleton,
  notFound,
  children,
  className,
}: {
  query: QueryState<T>
  skeleton: ReactNode
  notFound?: string
  children: (data: T) => ReactNode
  className?: string
}) {
  const cachedAtMount = useRef(query.data !== undefined)
  if (query.data !== undefined)
    return <div className={cn(!cachedAtMount.current && 'animate-fade-in', className)}>{children(query.data)}</div>
  if (query.fetchStatus === 'paused') return <OfflineState className={className} />
  if (query.error) return <ErrorState error={query.error} notFound={notFound} onRetry={() => query.refetch()} className={className} />
  return <>{skeleton}</>
}
