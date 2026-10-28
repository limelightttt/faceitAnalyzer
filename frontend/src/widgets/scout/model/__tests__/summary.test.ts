import { describe, expect, it } from 'vitest'

import type { Pair, ScoutPlayer, ScoutReport } from '@/entities/scout'

import { summarize } from '../summary'

const player = (nickname: string, rank: number, flagged = false) =>
  ({ player_id: nickname, nickname, threat: { rank, score: 1 / rank, components: {} }, roles: [], recent: { n: 20 }, risk: { classification: flagged ? 'smurf' : null, label: 'необычный' } }) as unknown as ScoutPlayer
const pair = (a: string, b: string, category: Pair['category'], shared: number) =>
  ({ a, b, a_name: a, b_name: b, category, shared_matches: shared, win_rate_together: 0.6 }) as unknown as Pair
const team = (name: string, players: ScoutPlayer[], pairs: Pair[] = []) => ({ name, players, pairs, summary: { players_missing_data: [] } })

function report(over: Partial<ScoutReport> = {}): ScoutReport {
  return {
    user_faction: 'faction2',
    map: null,
    comparison: { elo_expectation: 0.62, elo_favours: 'a', factor_count: { a: 3, b: 1 } },
    teams: {
      faction1: team('them', [player('e3', 6), player('e1', 1, true), player('e2', 3), player('e4', 8)], [pair('e1', 'e2', 'possible_duo', 9), pair('e3', 'e4', 'insufficient_evidence', 1)]),
      faction2: team('us', [player('me', 2), player('m1', 4)], [pair('me', 'm1', 'established_cooperation', 30)]),
    },
    map_pool: [
      { map: 'de_mirage', us_matches: 400, us_win_rate: 0.56, them_matches: 300, them_win_rate: 0.58 },
      { map: 'de_nuke', us_matches: 200, us_win_rate: 0.49, them_matches: 250, them_win_rate: 0.44 },
      { map: 'de_anubis', us_matches: 5, us_win_rate: 1, them_matches: 6, them_win_rate: 1 },
    ],
    ...over,
  } as unknown as ScoutReport
}

describe('report summary', () => {
  it('tells the chance from the user side', () => {
    const s = summarize(report())
    expect(s.side).toBe('faction2')
    expect(s.winChance).toBeCloseTo(0.38)
    expect(s.favoured).toBe('them')
    expect(s.factors).toEqual({ us: 1, them: 3 })
  })

  it('lists the opponents biggest threats and duos first, ignoring weak co-occurrence', () => {
    const s = summarize(report())
    expect(s.threats.map((p) => p.nickname)).toEqual(['e1', 'e2', 'e3'])
    expect(s.duos.map((d) => `${d.a}+${d.b}`)).toEqual(['e1+e2', 'me+m1'])
    expect(s.flagged.map((p) => p.nickname)).toEqual(['e1'])
  })

  it('before the veto points at strong and weak maps with enough games only', () => {
    const s = summarize(report())
    expect(s.map).toEqual({ picked: false, theirBest: ['de_mirage'], theirWorst: ['de_nuke'], ourBest: ['de_mirage'] })
  })
})
