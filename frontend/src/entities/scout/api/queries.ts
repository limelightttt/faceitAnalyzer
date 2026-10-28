import { useMutation, useQuery } from '@tanstack/react-query'

import { apiGet, apiPost } from '@/shared/api/client'

import type { ScoutJob } from '../model/types'

export const useScoutJob = (id: string) =>
  useQuery({
    queryKey: ['scout', id],
    queryFn: ({ signal }) => apiGet<ScoutJob>(`/scout/${id}`, signal),
    // poll while the server works; stop polling (but keep data) while the connection is down
    refetchInterval: (q) => (q.state.data?.status === 'running' ? 1000 : false),
  })

/** `inline`: the caller renders the error next to its form instead of a toast. */
export const useStartScout = ({ inline = false } = {}) =>
  useMutation({
    mutationFn: (body: { url: string; refresh?: boolean }) => apiPost<{ id: string; match_id: string; reused: boolean }>('/scout', body),
    meta: { inlineError: inline, errorContext: 'Разведка не запущена' },
  })

export const useDetectMatch = () =>
  useMutation({
    mutationFn: () => apiGet<{ found: boolean; match_id?: string; reason?: string }>('/scout-detect'),
    meta: { inlineError: true },
  })

export interface MapGeometry {
  map: string
  radar_available: boolean
  size: number
  centroids: { place: string; x: number; y: number; n: number }[]
  points: { steam_id: string; x: number; y: number; kind: string; side: string; phase: string; place: string | null; area: string }[]
}

export const useMapGeometry = (map: string | null, steamIds: string[]) =>
  useQuery({
    queryKey: ['map', map, steamIds.join(',')],
    queryFn: ({ signal }) => apiGet<MapGeometry>(`/maps/${map}?steam_ids=${steamIds.join(',')}`, signal),
    enabled: Boolean(map),
    retry: false,
  })
