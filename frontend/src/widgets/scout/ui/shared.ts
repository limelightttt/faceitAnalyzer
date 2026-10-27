import type { Faction, ScoutReport } from '@/entities/scout'

export const FACTION_COLOR: Record<Faction, string> = { faction1: 'var(--series-1)', faction2: 'var(--series-2)' }

export function teamLabel(r: ScoutReport, f: Faction): string {
  if (!r.user_faction) return r.teams[f].name
  return r.user_faction === f ? `${r.teams[f].name} (вы)` : `${r.teams[f].name} (соперники)`
}

export function orderedFactions(r: ScoutReport): [Faction, Faction] {
  return r.user_faction === 'faction2' ? ['faction2', 'faction1'] : ['faction1', 'faction2']
}

export const AREA_LABEL: Record<string, string> = { A: 'A', B: 'B', Mid: 'Mid', 'CT spawn': 'CT spawn', 'T spawn': 'T spawn', other: 'прочее' }

export const LEVEL_LABEL: Record<string, string> = {
  insufficient: 'недостаточно данных',
  preliminary: 'предварительно',
  pattern: 'устойчивый паттерн',
}
