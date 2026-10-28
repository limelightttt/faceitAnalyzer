export interface Identity {
  provider: 'steam' | 'faceit' | 'dev'
  subject: string
  display_name: string | null
  verified_at: string
}

export interface GameProfile {
  faceit_player_id: string
  nickname: string
  steam_id: string | null
  source: 'faceit_oauth' | 'steam_lookup' | 'dev'
}

export interface Session {
  authenticated: boolean
  csrf_token?: string
  user?: { id: number; created_at: string }
  identities?: Identity[]
  game_profile?: GameProfile | null
  providers: Record<'steam' | 'faceit' | 'dev', { configured: boolean }>
}

export interface UserSettings {
  sample_size: 20 | 50 | 100 | 200
  preferred_maps: string[]
  show_risk_signals: boolean
  timezone: string
  watchlist: string[]
  /** nicknames you usually queue with: the default group for the stack map pool */
  teammates: string[]
}
