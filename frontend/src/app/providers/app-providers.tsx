import { type QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type ReactNode, useEffect, useRef } from 'react'

import { useConnectivity } from '@/shared/api/network'
import { notify } from '@/shared/lib/notify'
import { Toaster, TooltipProvider } from '@/shared/ui'

import { queryClient } from './query-client'

/** When the device or the server comes back, refresh what failed and tell the user once. */
function ConnectivitySync({ client }: { client: QueryClient }) {
  const { online, serverReachable } = useConnectivity()
  const ok = online && serverReachable
  const was = useRef(ok)
  useEffect(() => {
    if (ok && !was.current) {
      notify.success('Соединение восстановлено', { id: 'connection', description: 'Данные обновляются.' })
      client.invalidateQueries({ predicate: (q) => q.state.status === 'error' || q.state.fetchStatus === 'paused' })
    }
    was.current = ok
  }, [ok, client])
  return null
}

export function AppProviders({ children, client = queryClient }: { children: ReactNode; client?: QueryClient }) {
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider delayDuration={250}>
        {children}
        <ConnectivitySync client={client} />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  )
}
