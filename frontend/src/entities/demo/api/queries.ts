import { useQuery } from '@tanstack/react-query'

import { apiGet } from '@/shared/api/client'

import type { DemoAnalysis, DemoMeta } from '../model/types'

const pending = (s?: string) => s === 'queued' || s === 'parsing'

export const useDemos = () =>
  useQuery({
    queryKey: ['demos'],
    queryFn: ({ signal }) => apiGet<DemoMeta[]>('/demos', signal),
    refetchInterval: (q) => (q.state.data?.some((d) => pending(d.status)) ? 1500 : false),
  })

export const useDemo = (id: string) =>
  useQuery({
    queryKey: ['demo', id],
    queryFn: ({ signal }) => apiGet<{ meta: DemoMeta; analysis: DemoAnalysis | null }>(`/demos/${id}`, signal),
    refetchInterval: (q) => (pending(q.state.data?.meta.status) ? 1500 : false),
    staleTime: (q) => (q.state.data?.meta.status === 'done' ? Infinity : 0),
  })
