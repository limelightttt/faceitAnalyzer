import type { Faction, ScoutReport } from '@/entities/scout'
import { cn } from '@/shared/lib/cn'
import { pct } from '@/shared/lib/format'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Hint } from '@/shared/ui'

import { FACTION_COLOR, orderedFactions, teamLabel } from './shared'

/** Dot strip: every player's Elo on one shared axis, one row per team. */
function EloStrip({ r }: { r: ScoutReport }) {
  const all = Object.values(r.teams).flatMap((t) => t.players.map((p) => p.elo ?? 0)).filter(Boolean)
  if (!all.length) return null
  const lo = Math.min(...all) - 50
  const hi = Math.max(...all) + 50
  const x = (v: number) => ((v - lo) / (hi - lo)) * 100
  const ticks = Array.from({ length: 5 }, (_, i) => Math.round((lo + ((hi - lo) * i) / 4) / 10) * 10)
  return (
    <div className="space-y-3" role="img" aria-label="Распределение Elo игроков обеих команд">
      {orderedFactions(r).map((f) => {
        const t = r.teams[f]
        return (
          <div key={f} className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-3">
            <span className="truncate text-xs text-muted-foreground">{teamLabel(r, f)}</span>
            <div className="relative h-8">
              <div className="absolute top-1/2 h-px w-full bg-[var(--grid)]" />
              {t.summary.elo_min !== null && t.summary.elo_max !== null && (
                <div
                  className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full opacity-30"
                  style={{ left: `${x(t.summary.elo_min)}%`, width: `${x(t.summary.elo_max) - x(t.summary.elo_min)}%`, background: FACTION_COLOR[f] }}
                />
              )}
              {t.summary.avg_elo !== null && (
                <div className="absolute top-0 h-8 w-0.5 rounded" style={{ left: `${x(t.summary.avg_elo)}%`, background: FACTION_COLOR[f] }} title={`Средний ${t.summary.avg_elo}`} />
              )}
              {t.players.map((p) =>
                p.elo ? (
                  <Hint key={p.player_id} content={`${p.nickname}: ${p.elo} Elo, уровень ${p.level ?? '—'}`}>
                    <span
                      className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card"
                      style={{ left: `${x(p.elo)}%`, background: FACTION_COLOR[f] }}
                    />
                  </Hint>
                ) : null,
              )}
            </div>
          </div>
        )
      })}
      <div className="grid grid-cols-[88px_minmax(0,1fr)] gap-3">
        <span />
        <div className="flex justify-between text-[10px] text-subtle-foreground tabular">
          {ticks.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
      </div>
    </div>
  )
}

const fmtVal = (key: string, v: number | null) => {
  if (v === null || v === undefined) return '—'
  if (key.includes('win_rate')) return pct(v)
  if (key === 'recent_rating') return v.toFixed(2)
  return String(Math.round(v))
}

export function TeamBalance({ r }: { r: ScoutReport }) {
  const [left, right] = orderedFactions(r)
  const c = r.comparison
  const pLeft = c.elo_expectation === null ? null : left === 'faction1' ? c.elo_expectation : 1 - c.elo_expectation
  const official = c.official_win_probability === null ? null : left === 'faction1' ? c.official_win_probability : 1 - c.official_win_probability
  const side = (f: Faction): 'a' | 'b' => (f === 'faction1' ? 'a' : 'b')
  return (
    <Card>
      <CardHeader>
        <CardTitle>Баланс команд</CardTitle>
        <CardDescription>{c.uncertainty}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-4">
          {[left, right].map((f, i) => (
            <div key={f} className={cn(i === 1 && 'order-3 text-right')}>
              <div className="flex items-center gap-2 text-xs text-muted-foreground" style={{ justifyContent: i === 1 ? 'flex-end' : undefined }}>
                <span className="inline-block size-2.5 rounded-full" style={{ background: FACTION_COLOR[f] }} />
                <span className="truncate">{teamLabel(r, f)}</span>
              </div>
              <div className="mt-1 text-3xl font-semibold tracking-tight tabular">{r.teams[f].summary.avg_elo ?? '—'}</div>
              <div className="text-xs text-subtle-foreground">средний Elo · разброс {r.teams[f].summary.elo_spread ?? '—'}</div>
            </div>
          ))}
          <div className="order-2 pb-1 text-center">
            <div className="text-[11px] text-subtle-foreground">Elo-ожидание</div>
            <div className="text-lg font-semibold tabular">{pLeft === null ? '—' : `${Math.round(pLeft * 100)} : ${Math.round((1 - pLeft) * 100)}`}</div>
            {official !== null && <div className="text-[11px] text-subtle-foreground">FACEIT: {Math.round(official * 100)} : {Math.round((1 - official) * 100)}</div>}
          </div>
        </div>
        {pLeft !== null && (
          <Hint content="Формула Elo по средним рейтингам команд (шкала 400). Не откалибровано на ваших матчах — точность отслеживается на странице «Прогнозы».">
            <div className="flex h-2.5 overflow-hidden rounded-full" role="img" aria-label={`Elo-ожидание ${Math.round(pLeft * 100)}%`}>
              <div style={{ width: `${pLeft * 100}%`, background: FACTION_COLOR[left] }} />
              <div className="w-0.5 bg-card" />
              <div className="flex-1" style={{ background: FACTION_COLOR[right] }} />
            </div>
          </Hint>
        )}
        <EloStrip r={r} />
        <div className="divide-y">
          {c.factors.map((f) => {
            const fav = f.favours === null ? null : f.favours === side(left) ? left : right
            return (
              <div key={f.key} className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 py-2 text-sm">
                <span className={cn('tabular', fav === left && 'font-semibold')}>{fmtVal(f.key, f.favours === null && f.a === null ? null : left === 'faction1' ? f.a : f.b)}</span>
                <span className="text-center text-xs text-muted-foreground">
                  {f.label}
                  {fav && <span className="ml-1 text-[10px] text-subtle-foreground">({f.magnitude === 'large' ? 'сильно' : f.magnitude === 'medium' ? 'заметно' : 'слегка'} {fav === left ? '←' : '→'})</span>}
                  {f.note && <span className="block text-[10px] text-subtle-foreground">{f.note}</span>}
                </span>
                <span className={cn('text-right tabular', fav === right && 'font-semibold')}>{fmtVal(f.key, left === 'faction1' ? f.b : f.a)}</span>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
