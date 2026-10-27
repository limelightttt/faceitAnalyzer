export type DataSource = 'faceit_api' | 'real_snapshot' | 'synthetic'

export interface Profile {
  player_id: string
  nickname: string
  avatar: string | null
  country: string | null
  region: string | null
  elo: number | null
  skill_level: number | null
  steam_id: string | null
  faceit_url: string | null
}

export interface DataQuality {
  source: DataSource
  matches_requested: number
  matches_loaded: number
  matches_with_stats: number
  has_timestamps: boolean
  has_team_elo: boolean
  has_official_elo: boolean
  notes: string[]
  freshness?: { requests: number; from_cache: number; stale: boolean; oldest: string | null }
}

export interface MatchRow {
  match_id: string
  map: string | null
  started_at: string | null
  won: boolean | null
  score_for: number | null
  score_against: number | null
  rounds: number | null
  team_avg_elo: number | null
  opp_avg_elo: number | null
  win_probability: number | null
  party_size: number
  party_members: string[]
  faceit_url: string | null
  has_stats: boolean
  kills?: number
  deaths?: number
  assists?: number
  adr?: number | null
  hs_pct?: number
  kd?: number
  kr?: number
  rating?: number
  mvps?: number
  multi_kills?: Record<'2k' | '3k' | '4k' | '5k', number>
  entry_count?: number | null
  entry_wins?: number | null
  utility_damage?: number | null
  enemies_flashed?: number | null
  clutch_1v1?: [number | null, number | null]
  clutch_1v2?: [number | null, number | null]
}

export interface TrendPoint {
  idx: number
  match_id: string
  started_at: string | null
  map: string | null
  won: boolean | null
  rating: number
  adr: number | null
  kd: number
  kills: number
  rating_rolling: number
}

export interface MapStat {
  map: string
  matches: number
  wins: number
  win_rate: number | null
  win_rate_ci: [number, number]
  rating: number | null
  adr: number | null
  kd: number
}

export interface Overview {
  profile: Profile
  quality: DataQuality
  totals: {
    matches: number
    with_stats: number
    wins: number
    losses: number
    win_rate: number | null
    win_rate_ci: [number, number]
    kd: number | null
    kills: number
    deaths: number
    adr: number | null
    hs_pct: number | null
    kr: number | null
    rating: number | null
    current_streak: number
    multi_kills: Record<string, number>
  }
  form: { recent_n: number; older_n: number; recent_rating: number | null; older_rating: number | null; recent_win_rate: number | null }
  trend: TrendPoint[]
  maps: MapStat[]
  matches: MatchRow[]
}

export interface BestWorst {
  best: MatchRow[]
  worst: MatchRow[]
  comparison: { metric: string; label: string; best: number; worst: number; all: number; delta: number }[]
  context?: {
    best_party_share: number
    worst_party_share: number
    best_maps: string[]
    worst_maps: string[]
    best_win_rate: number
    worst_win_rate: number
  }
  n: number
  method?: string
}

export type InsightStatus = 'strength' | 'weakness' | 'neutral' | 'insufficient_data'

export interface InsightItem {
  key: string
  label: string
  description: string
  n: number
  kind: 'paired' | 'pooled'
  status: InsightStatus
  confidence: 'low' | 'medium' | 'high'
  player?: number | null
  lobby?: number | null
  diff?: number
  ci?: [number, number]
  effect_size?: number
  percentile?: number
  attempts?: number
}

export interface Insights {
  items: InsightItem[]
  strengths: string[]
  weaknesses: string[]
  matches_used: number
  method: string
}

export interface EloReport {
  official: { elo: number | null; skill_level: number | null; source: DataSource }
  snapshots: { at: string; elo: number }[]
  reconstructed: { match_id: string; started_at: string | null; elo_after: number; delta: number; won: boolean; distance: number }[]
  projection: {
    start: number | null
    relative: boolean
    posterior_win_rate: number
    recent_n: number
    recent_wins: number
    series: { step: number; p10: number; p50: number; p90: number }[]
  } | null
  results_implied: { available: boolean; n_matches: number; reason?: string; estimate?: number; ci80?: [number, number]; wins?: number; official?: number | null }
  implied: {
    available: boolean
    n_matches: number
    reason?: string
    estimate?: number
    ci80?: [number, number]
    lobby_avg_elo?: number
    rating_surplus?: number
    slope_per_100?: number
  }
  method: string
}

export type TestStatus = 'insufficient_data' | 'no_anomaly' | 'weak_signal' | 'anomaly'

export interface MMTest {
  id: string
  title: string
  question: string
  method: string
  n: number
  min_n: number
  alternatives: string[]
  status: TestStatus
  p_value: number | null
  q_value: number | null
  statistic: number | null
  effect: string | null
  practical: boolean
  chart:
    | null
    | { type: 'calibration'; bins: { bin: string; expected: number; observed: number; n: number }[] }
    | { type: 'sequence'; sequence: ('W' | 'L')[] }
    | { type: 'bars'; x_label: string; y_label: string; bars: { label: string; value: number; n: number }[] }
    | { type: 'winrate'; bars: { label: string; value: number; ci?: [number, number]; n: number; expected?: number | null }[] }
    | { type: 'histogram'; unit?: string; values: number[] }
}

export interface Matchmaking {
  matches: number
  tests: MMTest[]
  anomalies: string[]
  verdict: { code: 'insufficient_data' | 'anomaly' | 'no_evidence'; confidence: string; text: string }
  method: string
  fdr: number
}

export interface MatchDetail {
  row: MatchRow
  team_index: number
  player_id: string
  match: {
    match_id: string
    map: string | null
    region: string | null
    competition: string | null
    started_at: string | null
    rounds: number | null
    winner_team_id: string | null
    faceit_url: string | null
    teams: {
      team_id: string
      name: string
      score: number | null
      first_half: number | null
      second_half: number | null
      overtime: number | null
      avg_elo: number | null
      win_probability: number | null
      players: {
        player_id: string
        nickname: string
        skill_level: number | null
        stats: {
          kills: number
          deaths: number
          assists: number
          adr: number | null
          hs_pct: number
          kd: number
          kr: number
          rating: number
          mvps: number
          triple_kills: number
          quadro_kills: number
          penta_kills: number
          entry_count: number | null
          entry_wins: number | null
          utility_damage: number | null
          enemies_flashed: number | null
        } | null
      }[]
    }[]
  }
}

