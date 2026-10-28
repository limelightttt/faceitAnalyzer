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
    // switching the sample size keeps the current numbers on screen until the new ones arrive
    // (never across players: another nickname starts from a clean loading state)
    placeholderData: (prev, prevQuery) => (prevQuery?.queryKey[1] === nick.toLowerCase() ? prev : undefined),
  })
}

export const useOverview = (nick: string, limit: number) => usePlayerResource<Overview>(nick, limit, 'overview')
export const useBestWorst = (nick: string, limit: number) => usePlayerResource<BestWorst>(nick, limit, 'best-worst')
export const useInsights = (nick: string, limit: number) => usePlayerResource<Insights>(nick, limit, 'insights')
export const useElo = (nick: string, limit: number) => usePlayerResource<EloReport>(nick, limit, 'elo')
export const useMatchmaking = (nick: string, limit: number) => usePlayerResource<Matchmaking>(nick, limit, 'matchmaking')
export const useMatchDetail = (nick: string, limit: number, matchId: string) =>
  usePlayerResource<MatchDetail>(nick, limit, `matches/${enc(matchId)}`)
