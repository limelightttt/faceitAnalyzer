import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { ApiError } from '@/shared/api/client'
import { TooltipProvider } from '@/shared/ui'

// Any 401 means the session expired or was revoked: re-read it so the app shows the sign-in screen.
const onError = (err: unknown) => {
  if (err instanceof ApiError && err.status === 401) queryClient.invalidateQueries({ queryKey: ['session'] })
}

export const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({ onError }),
  mutationCache: new MutationCache({ onError }),
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      // never hammer FACEIT through retries on client errors / rate limits
      retry: (count, err) => count < 1 && !(err instanceof ApiError && err.status >= 400 && err.status < 500),
    },
  },
})

export function AppProviders({ children, client = queryClient }: { children: ReactNode; client?: QueryClient }) {
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider>{children}</TooltipProvider>
    </QueryClientProvider>
  )
}
