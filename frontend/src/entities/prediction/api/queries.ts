import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { PredictionView } from '@/entities/scout'
import { apiGet, apiPost } from '@/shared/api/client'

export interface PredictionMetrics {
  resolved: number
  scored: number
  brier?: number
  baseline_brier?: number
  log_loss?: number
  baseline_log_loss?: number
  skill_vs_baseline?: number
  favourite_accuracy?: number | null
  favourite_n?: number
  calibration?: { bin: string; n: number; predicted: number; observed: number }[]
  cumulative?: { n: number; brier: number }[]
  signals: { risk_flags: number; risk_flag_top3_rate: number | null; threats: number; threat_top3_rate: number | null; note: string }
  feedback: { total: number; by_verdict: Record<string, number> }
  min_for_conclusions: number
}

export const usePredictions = (enabled = true) =>
  useQuery({ queryKey: ['predictions'], queryFn: ({ signal }) => apiGet<PredictionView[]>('/predictions', signal), enabled })

export const usePredictionMetrics = (enabled = true) =>
  useQuery({ queryKey: ['prediction-metrics'], queryFn: ({ signal }) => apiGet<PredictionMetrics>('/predictions/metrics', signal), enabled })

export const useResolvePredictions = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => apiPost<{ checked: number; resolved: number }>('/predictions/resolve'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['predictions'] })
      qc.invalidateQueries({ queryKey: ['prediction-metrics'] })
      qc.invalidateQueries({ queryKey: ['scout'] })
    },
  })
}

export const useSendFeedback = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { match_id?: string; prediction_id?: number; target: string; verdict: 'correct' | 'incorrect' | 'unsure'; comment?: string }) =>
      apiPost<{ id: number }>('/feedback', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['feedback'] }),
  })
}

export const useFeedback = (matchId: string | undefined, enabled: boolean) =>
  useQuery({
    queryKey: ['feedback', matchId],
    queryFn: ({ signal }) => apiGet<{ id: number; target: string; verdict: string }[]>(`/feedback?match_id=${matchId}`, signal),
    enabled: enabled && Boolean(matchId),
  })
