import { ChevronLeft, ChevronRight, Crosshair, Eye, Flame, Repeat, Wind, Zap } from 'lucide-react'

import type { DemoAnalysis, DemoKill } from '@/entities/demo'
import { cn } from '@/shared/lib/cn'
import { clock } from '@/shared/lib/format'
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, CopyButton } from '@/shared/ui'

const BUY: Record<string, string> = { pistol: 'пистолетный', eco: 'эко', force: 'форс', full: 'фулл-бай' }

function TeamDot({ team }: { team: 'A' | 'B' | null }) {
  return <span className="inline-block size-2 shrink-0 rounded-full" style={{ background: team === 'A' ? 'var(--series-1)' : team === 'B' ? 'var(--series-2)' : 'var(--subtle-foreground)' }} />
}

function KillRow({ k, names, focus }: { k: DemoKill; names: Record<string, string>; focus: string | null }) {
  const involved = focus && (k.attacker === focus || k.victim === focus)
  return (
    <div className={cn('grid grid-cols-[44px_1fr] items-center gap-2 rounded-md px-2 py-1.5 text-sm', involved && 'bg-primary/10')}>
      <span className="text-xs text-subtle-foreground tabular">{clock(k.time)}</span>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <span className="flex min-w-0 items-center gap-1.5 font-medium">
          <TeamDot team={k.attacker_team} />
          <span className="truncate">{k.attacker ? names[k.attacker] ?? k.attacker : 'мир'}</span>
        </span>
        <span className="rounded bg-card-2 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">{k.weapon}</span>
        <span className="flex min-w-0 items-center gap-1.5">
          <TeamDot team={k.victim_team} />
          <span className="truncate">{names[k.victim] ?? k.victim}</span>
        </span>
        <span className="flex flex-wrap gap-1">
          {k.headshot && <Badge><Crosshair /> HS</Badge>}
          {k.opening && <Badge variant="brand">opening</Badge>}
          {k.trade && <Badge><Repeat /> трейд</Badge>}
          {k.wallbang && <Badge><Zap /> прострел</Badge>}
          {k.thrusmoke && <Badge><Wind /> смок</Badge>}
          {k.noscope && <Badge>noscope</Badge>}
          {k.attacker_blind && <Badge><Eye /> слепой</Badge>}
          {k.flash_assist && <Badge><Flame /> флеш-ассист</Badge>}
          {k.team_kill && <Badge variant="bad">тимкилл</Badge>}
        </span>
      </div>
    </div>
  )
}

export function RoundDetail({
  data,
  round,
  onSelect,
  focus,
}: {
  data: DemoAnalysis
  round: number
  onSelect: (n: number) => void
  focus: string | null
}) {
  const r = data.rounds.find((x) => x.number === round) ?? data.rounds[0]
  if (!r) return null
  const names = Object.fromEntries(data.players.map((p) => [p.steamid, p.name]))
  const teamName = (t: 'A' | 'B') => data.teams.find((x) => x.id === t)?.name ?? t
  const highlights = data.highlights.filter((h) => r.highlights.includes(h.id))
  const gotoTick = Math.max(r.freeze_end_tick - 64 * 2, 0)
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>
            Раунд {r.number} · {teamName(r.winner_team)} ({r.winner_side})
          </CardTitle>
          <CardDescription>
            {r.reason_text} · {clock(r.duration)} · счёт {r.score_after.A}:{r.score_after.B}
          </CardDescription>
        </div>
        <div className="flex items-center gap-1">
          <CopyButton text={`demo_gototick ${gotoTick}`} label="к началу раунда" />
          <Button variant="ghost" size="icon" aria-label="Предыдущий раунд" disabled={r.number <= 1} onClick={() => onSelect(r.number - 1)}>
            <ChevronLeft />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Следующий раунд" disabled={r.number >= data.rounds.length} onClick={() => onSelect(r.number + 1)}>
            <ChevronRight />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div>
          <div className="mb-1 text-xs font-medium text-muted-foreground">Килл-фид</div>
          {r.kills.length === 0 ? (
            <div className="text-sm text-subtle-foreground">В этом раунде не было убийств.</div>
          ) : (
            <div className="space-y-0.5">
              {r.kills.map((k) => (
                <KillRow key={`${k.tick}-${k.victim}`} k={k} names={names} focus={focus} />
              ))}
            </div>
          )}
        </div>
        <div className="space-y-4 text-sm">
          <div>
            <div className="mb-1.5 text-xs font-medium text-muted-foreground">Экономика (снаряжение на старте)</div>
            {(['A', 'B'] as const).map((t) => (
              <div key={t} className="flex items-center justify-between py-1">
                <span className="flex items-center gap-2">
                  <TeamDot team={t} /> {teamName(t)} <span className="text-xs text-subtle-foreground">({r.sides[t]})</span>
                </span>
                <span className="tabular">
                  {r.economy[t].buy ? (
                    <>
                      ${r.economy[t].equipment.toLocaleString('ru-RU')} <span className="text-xs text-muted-foreground">· {BUY[r.economy[t].buy!]}</span>
                    </>
                  ) : (
                    <span className="text-xs text-subtle-foreground">нет данных</span>
                  )}
                </span>
              </div>
            ))}
          </div>
          {r.bomb.length > 0 && (
            <div>
              <div className="mb-1.5 text-xs font-medium text-muted-foreground">Бомба</div>
              {r.bomb.map((b, i) => (
                <div key={i} className="flex justify-between py-0.5 text-xs">
                  <span>
                    {b.event === 'planted' ? 'Установлена' : b.event === 'defused' ? 'Обезврежена' : 'Взорвалась'} {b.player ? `· ${b.player}` : ''}
                    {b.place ? ` · ${b.place}` : ''}
                  </span>
                  <span className="text-subtle-foreground tabular">{clock(b.time)}</span>
                </div>
              ))}
            </div>
          )}
          {r.clutch && (
            <div className="rounded-lg border p-3">
              <div className="text-xs text-muted-foreground">Клатч</div>
              <div className="mt-0.5 font-medium">
                {r.clutch.name} 1v{r.clutch.vs} — {r.clutch.won ? 'выигран' : 'проигран'} ({r.clutch.kills} убийств)
              </div>
            </div>
          )}
          {highlights.map((h) => (
            <div key={h.id} className="rounded-lg border border-warning/40 bg-warning/10 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">
                  ★ {h.title}: {h.player}
                </span>
                <span className="text-xs tabular">{h.score}/100</span>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{h.tags.join(' · ')}</div>
              <div className="mt-2">
                <CopyButton text={h.goto_cmd} />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
