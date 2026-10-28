import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'

import { markSessionExpired, type Session } from '@/entities/session'
import { errorKind, isConnectivityError } from '@/shared/api/errors'
import { shouldRetry } from '@/shared/api/query'
import { notify } from '@/shared/lib/notify'

/** Global query lifecycle policy (single source of truth for errors, toasts, retries, session expiry). */
// Any 401 means the session expired or was revoked: re-read it so the app shows the sign-in screen
// (with an explanation when the user had been signed in).
function onUnauthorized() {
  if (queryClient.getQueryData<Session>(['session'])?.authenticated) markSessionExpired()
  queryClient.invalidateQueries({ queryKey: ['session'] })
}

export const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (err, query) => {
      if (errorKind(err) === 'unauthorized') return onUnauthorized()
      // A screen with no data shows its own error state. A failed *background* refresh keeps the old
      // data on screen and says so once (connectivity problems are the banner's job).
      if (query.state.data !== undefined && !query.meta?.silent && !isConnectivityError(err)) {
        notify.apiError(err, 'Обновление данных', { id: 'refresh-failed', description: 'Показаны последние загруженные данные.' })
      }
    },
  }),
  mutationCache: new MutationCache({
    onError: (err, _v, _c, mutation) => {
      if (errorKind(err) === 'unauthorized') return onUnauthorized()
      if (!mutation.meta?.inlineError) notify.apiError(err, mutation.meta?.errorContext)
    },
    onSuccess: (_d, _v, _c, mutation) => {
      if (mutation.meta?.success) notify.success(mutation.meta.success)
    },
  }),
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: shouldRetry,
      retryDelay: 1500,
    },
    mutations: { retry: false },
  },
})

