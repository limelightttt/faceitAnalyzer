import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { DataQuality } from '@/entities/player'
import { apiDelete, apiGet, apiPost } from '@/shared/api/client'

export interface CoachGoal {
  id: number
  metric: string
  label: string
  map: string | null
  direction: 'up' | 'down'
  baseline: number
  baseline_n: number
  target: number
  created_at: string
  status: string
  progress: { current: number | null; n_after: number; reached: boolean | null; fraction: number | null; enough_data: boolean }
}

export interface CoachOverview {
  profile: { nickname: string; player_id: string; steam_id: string | null }
  quality: DataQuality
  weekly: { week: string; matches: number; wins: number; win_rate: number | null; rating: number | null; adr: number | null; kd: number | null; maps: [string, number][]; notes?: string[] }[]
  insights: { strengths: string[]; weaknesses: string[]; matches_used: number }
  demos: { demo_id: string; created_at: string; map: string; rounds: number; kast: number; adr: number; rating: number; opening_death_rate: number; traded_death_rate: number | null; trade_kills_pr: number; death_places: [string, number][] }[]
  mistakes: { kind: string; text: string }[]
  suggestions: { metric: string; label: string; why: string }[]
  metrics: Record<string, { label: string; better: 'up' | 'down'; source: 'faceit' | 'demo'; digits: number; pct?: boolean; needs_map?: boolean }>
  goals: CoachGoal[]
}

export const useCoach = (enabled: boolean) =>
  useQuery({ queryKey: ['coach'], queryFn: ({ signal }) => apiGet<CoachOverview>('/coach', signal), enabled, retry: false })

export const useCreateGoal = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (b: { metric: string; map?: string | null; target?: number | null }) => apiPost('/coach/goals', b),
    meta: { success: 'Цель поставлена', errorContext: 'Цель' },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['coach'] }),
  })
}

export const useDeleteGoal = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiDelete(`/coach/goals/${id}`),
    meta: { success: 'Цель удалена', errorContext: 'Удаление цели' },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['coach'] }),
  })
}
