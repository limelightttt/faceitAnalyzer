import { useQuery } from '@tanstack/react-query'

import { apiGet } from '@/shared/api/client'

import type { BestWorst, EloReport, Insights, MatchDetail, Matchmaking, Overview } from '../model/types'

const enc = encodeURIComponent

export const playerKeys = {
  all: (nick: string, limit: number) => ['player', nick.toLowerCase(), limit] as const,
}

function usePlayerResource<T>(nick: string, limit: number, resource: string) {
  return useQuery({
    queryKey: [...playerKeys.all(nick, limit), resource],
    queryFn: ({ signal }) => apiGet<T>(`/players/${enc(nick)}/${resource}?limit=${limit}`, signal),
    enabled: Boolean(nick),
    staleTime: 60_000,
    retry: (count, err) => count < 1 && !(err as { status?: number }).status?.toString().startsWith('4'),
  })
}

export const useOverview = (nick: string, limit: number) => usePlayerResource<Overview>(nick, limit, 'overview')
export const useBestWorst = (nick: string, limit: number) => usePlayerResource<BestWorst>(nick, limit, 'best-worst')
export const useInsights = (nick: string, limit: number) => usePlayerResource<Insights>(nick, limit, 'insights')
export const useElo = (nick: string, limit: number) => usePlayerResource<EloReport>(nick, limit, 'elo')
export const useMatchmaking = (nick: string, limit: number) => usePlayerResource<Matchmaking>(nick, limit, 'matchmaking')
export const useMatchDetail = (nick: string, limit: number, matchId: string) =>
  usePlayerResource<MatchDetail>(nick, limit, `matches/${enc(matchId)}`)

export const useHealth = () =>
  useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) =>
      apiGet<{ status: string; provider: string; api_key_configured: boolean; demo_parser: string; auth: { steam: boolean; faceit: boolean }; rate_limit: { limited: boolean; retry_in_s: number; retry_at: string | null } | null; require_login: boolean; private_beta: boolean }>('/health', signal),
    staleTime: 15_000,
    refetchInterval: 30_000,
  })
