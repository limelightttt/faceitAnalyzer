import { useQuery } from '@tanstack/react-query'

import { apiGet } from '@/shared/api/client'

export interface Health {
  status: string
  provider: string
  api_key_configured: boolean
  demo_parser: string
  auth: { steam: boolean; faceit: boolean }
  rate_limit: { limited: boolean; retry_in_s: number; retry_at: string | null } | null
  require_login: boolean
  private_beta: boolean
}

/** Server capabilities and FACEIT rate-limit state. Polled quietly: its failures are the connection
 * banner's business, never a toast. */
export const useHealth = () =>
  useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => apiGet<Health>('/health', signal),
    staleTime: 15_000,
    refetchInterval: 30_000,
    meta: { silent: true },
  })
