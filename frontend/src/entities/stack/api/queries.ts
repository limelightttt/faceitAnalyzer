import { useQuery } from '@tanstack/react-query'

import { apiGet } from '@/shared/api/client'

export interface StackMapPlayer {
  player_id: string
  nickname: string
  matches: number
  win_rate: number | null
  recent_matches: number
  recent_win_rate: number | null
}

export interface StackMap {
  map: string
  score: number
  verdict: 'pick' | 'neutral' | 'ban'
  confidence: 'low' | 'medium'
  inexperienced: string[]
  together_matches: number
  together_win_rate: number | null
  players: StackMapPlayer[]
}

export interface StackPool {
  players: { player_id: string; nickname: string; elo: number | null; avatar: string | null; errors: string[] }[]
  together: { matches: number; history_window: number; win_rate: number | null }
  maps: StackMap[]
  method: string
}

/** Map pool of a group that queues together. Adding a player keeps the previous table until the new one
 * arrives. */
export const useStackMaps = (nicknames: string[]) => {
  const key = nicknames.map((n) => n.toLowerCase()).sort()
  return useQuery({
    queryKey: ['stack', ...key],
    queryFn: ({ signal }) => apiGet<StackPool>(`/stack/maps?players=${encodeURIComponent(nicknames.join(','))}`, signal),
    enabled: nicknames.length > 0,
    staleTime: 5 * 60_000,
    placeholderData: (prev) => prev,
  })
}
