import { Bomb, Clock, Flag, Scissors, Skull, Star } from 'lucide-react'

import type { DemoAnalysis, DemoRound } from '@/entities/demo'
import { cn } from '@/shared/lib/cn'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Hint, Legend } from '@/shared/ui'

function ReasonIcon({ r }: { r: DemoRound }) {
  const cls = 'size-3.5'
  if (r.reason === 1) return <Bomb className={cls} aria-label="Бомба взорвана" />
  if (r.reason === 7) return <Scissors className={cls} aria-label="Разминирование" />
  if (r.reason === 12) return <Clock className={cls} aria-label="Время" />
  if (r.reason === 17 || r.reason === 18) return <Flag className={cls} aria-label="Сдача" />
  return <Skull className={cls} aria-label="Уничтожение" />
}

export function RoundTimeline({
  data,
  selected,
  onSelect,
  focus,
}: {
  data: DemoAnalysis
  selected: number
  onSelect: (n: number) => void
  focus: string | null
}) {
  const [a, b] = data.teams
  return (
    <Card>
      <CardHeader>
        <CardTitle>Таймлайн раундов</CardTitle>
        <CardDescription>Цвет — победившая команда, иконка — как закончился раунд, ★ — есть хайлайт. Клик открывает раунд.</CardDescription>
        <Legend
          items={[
            { label: a.name, color: 'var(--series-1)' },
            { label: b.name, color: 'var(--series-2)' },
          ]}
        />
      </CardHeader>
      <CardContent>
        <div className="flex gap-1 overflow-x-auto pb-2">
          {data.rounds.map((r) => {
            const focusKills = focus ? r.kills.filter((k) => k.attacker === focus && !k.team_kill).length : 0
            const focusDied = focus ? r.kills.some((k) => k.victim === focus) : false
            return (
              <Hint
                key={r.number}
                content={
                  <div className="space-y-0.5">
                    <div className="font-medium">
                      Раунд {r.number}: {r.winner_team === 'A' ? a.name : b.name} ({r.winner_side})
                    </div>
                    <div>{r.reason_text}</div>
                    <div>
                      Счёт {r.score_after.A}:{r.score_after.B} · {r.kills.length} убийств
                    </div>
                    {r.clutch && (
                      <div>
                        Клатч: {r.clutch.name} 1v{r.clutch.vs} — {r.clutch.won ? 'выигран' : 'проигран'}
                      </div>
                    )}
                    {focus && (
                      <div>
                        Фокус: {focusKills} убийств{focusDied ? ', погиб' : ', выжил'}
                      </div>
                    )}
                  </div>
                }
              >
                <button
                  type="button"
                  onClick={() => onSelect(r.number)}
                  aria-label={`Раунд ${r.number}`}
                  aria-pressed={selected === r.number}
                  className={cn(
                    'flex w-9 shrink-0 flex-col items-center gap-1 rounded-md border px-0.5 py-1.5 text-[11px] transition-all',
                    selected === r.number ? 'border-foreground/60 bg-card-2' : 'hover:bg-card-2',
                    (r.number === 13 || r.number === 25) && 'ml-2',
                  )}
                >
                  <span className="text-subtle-foreground tabular">{r.number}</span>
                  <span
                    className="flex size-6 items-center justify-center rounded text-white"
                    style={{ background: r.winner_team === 'A' ? 'var(--series-1)' : 'var(--series-2)' }}
                  >
                    <ReasonIcon r={r} />
                  </span>
                  <span className="flex h-3 items-center">
                    {r.highlights.length > 0 ? <Star className="size-3 fill-warning text-warning" aria-label="Хайлайт" /> : null}
                  </span>
                  {focus && (
                    <span className={cn('h-1 w-5 rounded-full', focusKills >= 2 ? 'bg-good' : focusKills === 1 ? 'bg-good/50' : focusDied ? 'bg-critical/60' : 'bg-card-2')} />
                  )}
                </button>
              </Hint>
            )
          })}
        </div>
        {focus && <p className="text-xs text-subtle-foreground">Полоска под раундом — фокус-игрок: зелёная — 2+ убийства, светло-зелёная — 1, красная — погиб без убийств.</p>}
      </CardContent>
    </Card>
  )
}
