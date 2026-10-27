import type { Overview } from '@/entities/player'
import { fmt, pct } from '@/shared/lib/format'
import { StatTile } from '@/shared/ui'

export function PlayerKpis({ data }: { data: Overview }) {
  const t = data.totals
  const f = data.form
  const formDelta =
    f.recent_rating !== null && f.older_rating !== null && f.older_n >= 5
      ? { text: `${(f.recent_rating - f.older_rating).toFixed(2)} за последние ${f.recent_n}`, good: f.recent_rating >= f.older_rating }
      : undefined
  const streak = t.current_streak
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <StatTile
        label="Win rate"
        value={pct(t.win_rate)}
        hint={`95% CI ${pct(t.win_rate_ci[0])}–${pct(t.win_rate_ci[1])} · ${t.wins}W ${t.losses}L`}
      />
      <StatTile label="Rating 1.0" value={fmt(t.rating)} delta={formDelta} />
      <StatTile label="K/D" value={fmt(t.kd)} hint={`${t.kills} / ${t.deaths}`} />
      <StatTile label="ADR" value={fmt(t.adr, 1)} hint={`K/R ${fmt(t.kr)}`} />
      <StatTile label="Headshot %" value={t.hs_pct === null ? '—' : `${t.hs_pct.toFixed(0)}%`} />
      <StatTile
        label="Текущая серия"
        value={streak === 0 ? '—' : `${Math.abs(streak)} ${streak > 0 ? 'W' : 'L'}`}
        hint={`3K ${t.multi_kills['3k']} · 4K ${t.multi_kills['4k']} · ACE ${t.multi_kills['5k']}`}
      />
    </div>
  )
}
