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

// --- AI coach (Claude): reviews and questions are paid, so they run only on an explicit click ---

export type FactValue = number | string | boolean | null | Record<string, number | string | boolean | null>

export interface AiFact {
  id: string
  label: string
  value: FactValue
  n?: number
}

export interface AiPoint {
  title: string
  detail: string
  certainty: 'fact' | 'estimate' | 'hypothesis'
  evidence: AiFact[]
}

export interface AiAction {
  title: string
  detail: string
  evidence: AiFact[]
  goal: { metric: string; map: string | null; label: string } | null
}

export interface AiReview {
  id: number
  created_at: string
  model: string
  cached: boolean
  summary: string
  problems: AiPoint[]
  actions: AiAction[]
  strengths: AiPoint[]
  messages: { role: 'player' | 'coach'; text: string; created_at: string }[]
}

export interface AiLimit {
  limit: number | null
  used: number
  left: number | null
  reset_at: string | null
}

export interface AiCoachStatus {
  enabled: boolean
  owner: boolean
  models: { review: string; chat: string }
  limits: { reviews: AiLimit; questions: AiLimit }
  review: AiReview | null
  new_matches: number | null
}

const AI_KEY = ['coach', 'ai']

export const useAiCoach = (enabled: boolean) =>
  useQuery({ queryKey: AI_KEY, queryFn: ({ signal }) => apiGet<AiCoachStatus>('/coach/ai', signal), enabled, retry: false })

export const useAiReview = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => apiPost<AiReview>('/coach/ai/review', {}),
    meta: { inlineError: true },
    onSettled: () => qc.invalidateQueries({ queryKey: AI_KEY }),
  })
}

export const useAskCoach = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (question: string) => apiPost<{ answer: string }>('/coach/ai/ask', { question }),
    meta: { inlineError: true },
    onSettled: () => qc.invalidateQueries({ queryKey: AI_KEY }),
  })
}
