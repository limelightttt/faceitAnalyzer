import type { Faction, Pair, ScoutPlayer, ScoutReport } from '@/entities/scout'

/** The few things to know in the minute before a match, derived from the full report (nothing is lost:
 * every item points to its detailed section). */
export interface ReportSummary {
  /** the side the numbers are told from: the user's team, else faction1 */
  side: Faction
  other: Faction
  winChance: number | null
  favoured: 'us' | 'them' | null
  factors: { us: number; them: number }
  threats: ScoutPlayer[]
  duos: (Pair & { faction: Faction })[]
  flagged: ScoutPlayer[]
  map:
    | { picked: true; name: string; us: TeamOnMap | null; them: TeamOnMap | null }
    | { picked: false; theirBest: string[]; theirWorst: string[]; ourBest: string[] }
}

interface TeamOnMap {
  matches: number
  winRate: number | null
  inexperienced: string[]
}

const DUO_RANK: Record<Pair['category'], number> = { established_cooperation: 3, possible_duo: 2, frequently_observed: 1, insufficient_evidence: 0 }
const MIN_MAP_SAMPLE = 20 // team lifetime matches on a map before its win rate is worth a mention

export function summarize(r: ScoutReport): ReportSummary {
  const side: Faction = r.user_faction ?? 'faction1'
  const other: Faction = side === 'faction1' ? 'faction2' : 'faction1'
  const p1 = r.comparison.elo_expectation
  const winChance = p1 === null ? null : side === 'faction1' ? p1 : 1 - p1
  const favouredFaction = r.comparison.elo_favours === 'a' ? 'faction1' : r.comparison.elo_favours === 'b' ? 'faction2' : null
  const sideFactors = side === 'faction1' ? [r.comparison.factor_count.a, r.comparison.factor_count.b] : [r.comparison.factor_count.b, r.comparison.factor_count.a]
  const all = Object.values(r.teams).flatMap((t) => t.players)
  const duos = (Object.entries(r.teams) as [Faction, ScoutReport['teams'][Faction]][])
    .flatMap(([faction, t]) => t.pairs.map((p) => ({ ...p, faction })))
    .filter((p) => DUO_RANK[p.category] > 0)
    .sort((a, b) => Number(a.faction === side) - Number(b.faction === side) || DUO_RANK[b.category] - DUO_RANK[a.category] || b.shared_matches - a.shared_matches)
  return {
    side,
    other,
    winChance,
    favoured: favouredFaction === null ? null : favouredFaction === side ? 'us' : 'them',
    factors: { us: sideFactors[0], them: sideFactors[1] },
    threats: [...r.teams[other].players].sort((a, b) => a.threat.rank - b.threat.rank).slice(0, 3),
    duos: duos.slice(0, 3),
    flagged: all.filter((p) => p.risk.classification),
    map: r.map ? { picked: true, name: r.map, us: teamOnMap(r, side), them: teamOnMap(r, other) } : mapHints(r),
  }
}

function teamOnMap(r: ScoutReport, f: Faction): TeamOnMap | null {
  const m = r.teams[f].summary.map
  return m ? { matches: m.total_matches, winRate: m.win_rate, inexperienced: m.inexperienced } : null
}

function mapHints(r: ScoutReport) {
  const rated = (who: 'us' | 'them') =>
    r.map_pool
      .filter((m) => m[`${who}_matches`] >= MIN_MAP_SAMPLE && m[`${who}_win_rate`] !== null)
      .map((m) => ({ map: m.map, wr: m[`${who}_win_rate`]! }))
      .sort((a, b) => b.wr - a.wr)
  const them = rated('them')
  return {
    picked: false as const,
    theirBest: them.filter((m) => m.wr >= 0.5).slice(0, 2).map((m) => m.map),
    theirWorst: them.filter((m) => m.wr < 0.5).slice(-2).reverse().map((m) => m.map),
    ourBest: rated('us').filter((m) => m.wr >= 0.5).slice(0, 2).map((m) => m.map),
  }
}
