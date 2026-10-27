export type DemoStatus = 'queued' | 'parsing' | 'done' | 'error'

export interface DemoMeta {
  id: string
  file_name: string
  status: DemoStatus
  source: 'upload' | 'sample'
  created_at: string
  size?: number
  map?: string
  rounds?: number
  score?: string
  players?: number
  highlights?: number
  parser?: string
  error?: string
  note?: string
}

export interface DemoKill {
  tick: number
  round: number
  time: number
  attacker: string | null
  victim: string
  assister: string | null
  weapon: string
  headshot: boolean
  flash_assist: boolean
  wallbang: boolean
  thrusmoke: boolean
  noscope: boolean
  attacker_blind: boolean
  attacker_team: 'A' | 'B' | null
  victim_team: 'A' | 'B' | null
  team_kill: boolean
  opening: boolean
  trade: boolean
  traded: boolean
}

export interface DemoRound {
  number: number
  winner_team: 'A' | 'B'
  winner_side: 'T' | 'CT'
  reason: number
  reason_text: string
  sides: { A: 'T' | 'CT'; B: 'T' | 'CT' }
  score_after: { A: number; B: number }
  freeze_end_tick: number
  end_tick: number
  duration: number
  kills: DemoKill[]
  economy: Record<'A' | 'B', { equipment: number; buy: 'pistol' | 'eco' | 'force' | 'full' | null }>
  bomb: { event: 'planted' | 'defused' | 'exploded'; time: number; place: string | null; player: string | null }[]
  clutch: { player: string; name: string; team: 'A' | 'B'; vs: number; won: boolean; kills: number; time: number } | null
  top_damage: { steamid: string; damage: number }[]
  highlights: string[]
}

export interface DemoPlayer {
  steamid: string
  name: string
  team: 'A' | 'B'
  rounds: number
  kills: number
  deaths: number
  assists: number
  flash_assists: number
  headshots: number
  damage: number
  utility_damage: number
  kast_rounds: number
  opening_kills: number
  opening_deaths: number
  trade_kills: number
  traded_deaths: number
  team_kills: number
  multi: Record<'2' | '3' | '4' | '5', number>
  clutch_attempts: number
  clutch_wins: number
  clutches: { round: number; vs: number; won: boolean; kills: number }[]
  flashes: number
  smokes: number
  he: number
  molotovs: number
  enemies_flashed: number
  enemy_blind_time: number
  team_flashed: number
  awp_kills: number
  survived: number
  adr: number
  kast: number
  hs_pct: number
  rating: number
  kpr: number
  kd: number
}

export interface Highlight {
  id: string
  round: number
  steamid: string
  player: string
  team: 'A' | 'B'
  score: number
  title: string
  kills: number
  headshots: number
  weapons: string[]
  tags: string[]
  round_time: number
  start_tick: number
  end_tick: number
  start_time_s: number
  goto_cmd: string
  round_won: boolean
  victims: string[]
}

export interface DemoInsight {
  kind: 'strength' | 'weakness' | 'info'
  title: string
  detail: string
  metric: string
  value: number
  lobby: number
}

export interface DemoAnalysis {
  file_name: string
  map: string
  server: string | null
  client: string | null
  parser: string
  tickrate: number
  duration_s: number
  rounds_played: number
  teams: { id: 'A' | 'B'; name: string; score: number; start_side: 'T' | 'CT'; players: string[] }[]
  players: DemoPlayer[]
  rounds: DemoRound[]
  highlights: Highlight[]
  insights: Record<string, DemoInsight[]>
  definitions: Record<string, string>
}
