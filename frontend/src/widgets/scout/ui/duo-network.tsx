import type { Faction, Pair, ScoutReport } from '@/entities/scout'
import { cn } from '@/shared/lib/cn'
import { pct } from '@/shared/lib/format'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Hint } from '@/shared/ui'

import { FACTION_COLOR, orderedFactions, teamLabel } from './shared'

const EDGE: Record<Pair['category'], { width: number; dash?: string; opacity: number }> = {
  insufficient_evidence: { width: 0, opacity: 0 },
  frequently_observed: { width: 1.5, dash: '4 4', opacity: 0.6 },
  possible_duo: { width: 3, opacity: 0.9 },
  established_cooperation: { width: 5, opacity: 1 },
}

function Network({ r, f }: { r: ScoutReport; f: Faction }) {
  const t = r.teams[f]
  const n = t.players.length
  const pos = Object.fromEntries(
    t.players.map((p, i) => {
      const a = (2 * Math.PI * i) / n - Math.PI / 2
      return [p.player_id, { x: 120 + 82 * Math.cos(a), y: 100 + 72 * Math.sin(a), name: p.nickname }]
    }),
  )
  const edges = t.pairs.filter((p) => p.category !== 'insufficient_evidence')
  return (
    <svg viewBox="0 0 240 200" className="h-48 w-full" role="img" aria-label={`Связи игроков команды ${t.name}`}>
      {edges.map((e) => {
        const a = pos[e.a]
        const b = pos[e.b]
        const st = EDGE[e.category]
        return (
          <line key={`${e.a}-${e.b}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={FACTION_COLOR[f]} strokeWidth={st.width} strokeDasharray={st.dash} strokeOpacity={st.opacity} strokeLinecap="round">
            <title>{`${e.a_name} + ${e.b_name}: ${e.category_label}, ${e.shared_matches} совместных`}</title>
          </line>
        )
      })}
      {Object.entries(pos).map(([id, p]) => (
        <g key={id}>
          <circle cx={p.x} cy={p.y} r={7} fill={FACTION_COLOR[f]} stroke="var(--card)" strokeWidth={2} />
          <text x={p.x} y={p.y + 19} textAnchor="middle" fontSize={10} fill="var(--muted-foreground)">
            {p.name.length > 12 ? `${p.name.slice(0, 11)}…` : p.name}
          </text>
        </g>
      ))}
    </svg>
  )
}

export function DuoNetwork({ r }: { r: ScoutReport }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Связки и химия команд</CardTitle>
        <CardDescription>
          По последним 30 матчам каждого игрока. FACEIT не подтверждает состав пати — это частота совместной игры. «Устойчивое взаимодействие» требует подтверждения
          в демках (совместные позиции или размены).
        </CardDescription>
        <div className="flex flex-wrap gap-4 pt-1 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <svg width="22" height="6">
              <line x1="1" y1="3" x2="21" y2="3" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 4" />
            </svg>
            часто вместе
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="22" height="6">
              <line x1="1" y1="3" x2="21" y2="3" stroke="currentColor" strokeWidth="3" />
            </svg>
            возможное дуо
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="22" height="6">
              <line x1="1" y1="3" x2="21" y2="3" stroke="currentColor" strokeWidth="5" />
            </svg>
            устойчивое взаимодействие
          </span>
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {orderedFactions(r).map((f) => {
          const pairs = r.teams[f].pairs.filter((p) => p.category !== 'insufficient_evidence')
          return (
            <div key={f} className="min-w-0">
              <div className="mb-1 text-xs font-medium text-muted-foreground">{teamLabel(r, f)}</div>
              <Network r={r} f={f} />
              {pairs.length === 0 ? (
                <EmptyState title="Повторяющихся связок не найдено">Игроки не встречались вместе в последних матчах (или данных недостаточно).</EmptyState>
              ) : (
                <div className="space-y-1.5">
                  {pairs.map((p) => (
                    <div key={`${p.a}-${p.b}`} className="rounded-lg border p-2.5 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">
                          {p.a_name} + {p.b_name}
                        </span>
                        <span className={cn('rounded px-1.5 py-0.5 text-[10px]', p.category === 'frequently_observed' ? 'bg-card-2 text-muted-foreground' : 'bg-primary/10 text-primary')}>
                          {p.category_label}
                        </span>
                      </div>
                      <div className="mt-1 text-muted-foreground tabular">
                        {p.shared_matches} совместных из {p.history_window} ({pct(p.share)})
                        {p.win_rate_together !== null && p.together_n >= 5 && ` · вместе WR ${pct(p.win_rate_together)}`}
                        {p.maps_together.length > 0 && ` · чаще на ${p.maps_together.map(([m]) => m.replace('de_', '')).join(', ')}`}
                      </div>
                      {p.rating_together.n >= 3 && (
                        <Hint content="Средний Rating в общих матчах против матчей порознь (по последним 30 матчам)">
                          <div className="mt-0.5 text-subtle-foreground tabular">
                            Rating вместе/порознь: {p.a_name} {p.rating_together.a ?? '—'}/{p.rating_apart.a ?? '—'}, {p.b_name} {p.rating_together.b ?? '—'}/{p.rating_apart.b ?? '—'}
                          </div>
                        </Hint>
                      )}
                      {p.demo_evidence && p.demo_evidence.shared_rounds > 0 && (
                        <div className="mt-0.5 text-subtle-foreground">
                          Демки: {p.demo_evidence.shared_rounds} общих раундов, вместе в зоне {pct(p.demo_evidence.colocation_rate)}, размены {p.demo_evidence.a_trades_b + p.demo_evidence.b_trades_a}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
