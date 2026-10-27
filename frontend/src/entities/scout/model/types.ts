export type Faction = 'faction1' | 'faction2'
export type EvidenceKind = 'fact' | 'estimate' | 'hypothesis'

export interface RiskSignal {
  key: string
  label: string
  value: unknown
  reference: unknown
  strength: number
  detail: string
  n: number | null
}

export interface PlayerRisk {
  player_id: string
  nickname: string
  signals: RiskSignal[]
  score: number
  classification: string | null
  label: string | null
  confidence: 'low' | 'medium' | null
  data: { lifetime_matches: number | null; recent_matches: number; account_age_days: number | null; elo: number | null; level: number | null }
  insufficient_data: boolean
  alternatives: string[]
  disclaimer: string
}

export interface SideProfile {
  rounds: number
  setup_areas: { area: string; count: number; share: number }[]
  top_places: { place: string; count: number }[]
  primary_area: { area: string; share: number; ci95: [number, number]; level: 'insufficient' | 'preliminary' | 'pattern' }
  isolation_rate: number | null
  openings: { wins: number; losses: number; areas: [string, number][] }
  duels_by_area: Record<string, { wins: number; losses: number; level: string }>
}

export interface TacticalProfile {
  observed: boolean
  maps: Record<string, { demos: number; sides: Partial<Record<'T' | 'CT', SideProfile>> }>
}

export interface ScoutPlayer {
  player_id: string
  nickname: string
  steam_id: string | null
  avatar: string | null
  country: string | null
  elo: number | null
  level: number | null
  account_age_days: number | null
  lifetime: { matches: number | null; win_rate: number | null; kd: number | null; hs: number | null; adr: number | null }
  recent: {
    n: number
    wins?: number
    win_rate?: number | null
    kd?: number | null
    adr?: number | null
    hs?: number | null
    rating?: number | null
    rating_sd?: number | null
    entry_per_round?: number | null
    entry_success?: number | null
    sniper_share?: number | null
  }
  form: { match_id: string; won: boolean | null; rating: number | null; map: string | null }[]
  map_segment: { matches: number | null; win_rate: number | null; kd: number | null } | null
  map_segments: Record<string, { matches: number | null; win_rate: number | null; kd: number | null }>
  threat: { score: number; rank: number; components: Record<string, number> }
  roles: { role: string; evidence: string }[]
  risk: PlayerRisk
  tactical: TacticalProfile | null
  errors: string[]
}

export interface Pair {
  a: string
  b: string
  a_name: string
  b_name: string
  shared_matches: number
  history_window: number
  share: number
  win_rate_together: number | null
  together_n: number
  rating_together: { a: number | null; b: number | null; n: number }
  rating_apart: { a: number | null; b: number | null }
  maps_together: [string, number][]
  category: 'insufficient_evidence' | 'frequently_observed' | 'possible_duo' | 'established_cooperation'
  category_label: string
  demo_evidence: {
    shared_rounds: number
    colocation_rate: number | null
    colocation_places: [string, number][]
    a_trades_b: number
    b_trades_a: number
    level: string
  } | null
  note: string
}

export interface TeamSummary {
  avg_elo: number | null
  median_elo: number | null
  elo_sd: number | null
  elo_min: number | null
  elo_max: number | null
  elo_spread: number | null
  recent_rating: number | null
  recent_win_rate: number | null
  recent_matches_total: number
  median_lifetime_matches: number | null
  players_missing_data: string[]
  map?: { map: string; total_matches: number; min_matches: number; win_rate: number | null; inexperienced: string[] }
}

export interface ScoutTeam {
  name: string
  summary: TeamSummary
  pairs: Pair[]
  groups: string[][]
  instability: { level: 'low' | 'moderate' | 'elevated' | 'insufficient_data'; signals: { key: string; text: string; evidence: string }[]; note: string }
  players: ScoutPlayer[]
}

export interface Factor {
  key: string
  label: string
  a: number | null
  b: number | null
  favours: 'a' | 'b' | null
  magnitude: string
  unit?: string
  note?: string
}

export interface BriefingItem {
  id: number
  kind: EvidenceKind
  category: string
  text: string
  evidence: Record<string, unknown>
  confidence: string | null
  refs: string[]
}

export interface ScoutReport {
  match_id: string
  status: string
  phase: 'pre' | 'live' | 'post' | 'dead' | 'unknown'
  map: string | null
  map_pool: { map: string; us_matches: number; us_win_rate: number | null; them_matches: number; them_win_rate: number | null }[]
  competition: string | null
  region: string | null
  faceit_url: string | null
  user_faction: Faction | null
  teams: Record<Faction, ScoutTeam>
  comparison: {
    elo_expectation: number | null
    official_win_probability: number | null
    elo_favours: 'a' | 'b' | null
    factors: Factor[]
    factor_count: { a: number; b: number }
    model: string
    calibrated: boolean
    uncertainty: string
  }
  briefing: BriefingItem[]
  result: { winner: Faction | null; score: string | null; players: Record<string, Record<string, string>> } | null
  algo_version: string
  generated_at: string
  freshness: { requests: number; from_cache: number; stale: boolean; stale_paths?: string[]; oldest: string | null }
  tactical_coverage: { players_with_demos: number; players_total: number }
}

export interface PredictionView {
  id: number
  match_id: string
  scout_id: string
  created_at: string
  match_status_at_prediction: string
  pre_match: boolean
  algo_version: string
  input_hash: string
  data_as_of: string | null
  payload: {
    map: string | null
    elo_expectation_faction1: number | null
    official_win_probability_faction1: number | null
    favoured: Faction | null
    factors: Factor[]
    risk_flags: Record<string, { classification: string; score: number }>
    user_faction: Faction | null
    briefing: { id: number; kind: EvidenceKind; category: string; text: string }[]
  }
  outcome: null | {
    resolved_at: string
    winner: Faction | null
    status: string
    brier?: number
    log_loss?: number
    p_winner?: number
    favoured_correct?: boolean | null
    signals?: { risk: { player_id: string; classification: string; adr_rank: number; top3: boolean }[]; threats: { faction: string; player_id: string; adr_rank: number; top3: boolean }[] }
  }
}

export interface ScoutJob {
  id: string
  match_id: string
  status: 'running' | 'done' | 'error'
  progress: number
  error: string | null
  created_at: string
  report: ScoutReport | null
  prediction: PredictionView | null
}
