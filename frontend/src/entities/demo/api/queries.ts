import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { apiDelete, apiGet } from '@/shared/api/client'

import type { DemoAnalysis, DemoMeta } from '../model/types'

export const demoPending = (s?: string) => s === 'queued' || s === 'parsing'

export const useDemos = () =>
  useQuery({
    queryKey: ['demos'],
    queryFn: ({ signal }) => apiGet<DemoMeta[]>('/demos', signal),
    refetchInterval: (q) => (q.state.data?.some((d) => demoPending(d.status)) ? 1500 : false),
  })

export const useDemo = (id: string) =>
  useQuery({
    queryKey: ['demo', id],
    queryFn: ({ signal }) => apiGet<{ meta: DemoMeta; analysis: DemoAnalysis | null }>(`/demos/${id}`, signal),
    refetchInterval: (q) => (demoPending(q.state.data?.meta.status) ? 1500 : false),
    staleTime: (q) => (q.state.data?.meta.status === 'done' ? Infinity : 0),
  })

export const useDeleteDemo = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/demos/${id}`),
    meta: { success: 'Демка удалена', errorContext: 'Удаление демки' },
    onSuccess: (_d, id) => {
      qc.removeQueries({ queryKey: ['demo', id] })
      return qc.invalidateQueries({ queryKey: ['demos'] })
    },
  })
}
