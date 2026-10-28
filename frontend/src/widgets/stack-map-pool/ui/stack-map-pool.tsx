import { Ban, Check, Minus } from 'lucide-react'

import { MapChip } from '@/entities/match'
import { type StackMap, type StackPool, useStackMaps } from '@/entities/stack'
import { cn } from '@/shared/lib/cn'
import { pct } from '@/shared/lib/format'
import { AsyncView, Badge, Hint, LoadingSkeleton, Notice, SkeletonTable, Table, TBody, TD, TH, THead, TR } from '@/shared/ui'

/** Opponents' lifetime record per map, when the pool is shown inside a scout report. */
export type OpponentMaps = Record<string, { matches: number; winRate: number | null }>

const VERDICT: Record<StackMap['verdict'], { label: string; icon: typeof Check; variant: 'good' | 'bad' | 'outline'; bar: string }> = {
  pick: { label: 'брать', icon: Check, variant: 'good', bar: 'bg-good' },
  neutral: { label: 'нейтрально', icon: Minus, variant: 'outline', bar: 'bg-series-1' },
  ban: { label: 'банить', icon: Ban, variant: 'bad', bar: 'bg-critical' },
}

function Score({ m }: { m: StackMap }) {
  const v = VERDICT[m.verdict]
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-1.5 w-20 overflow-hidden rounded-full bg-card-2" aria-hidden>
        <div className="absolute inset-y-0 left-1/2 w-px bg-subtle-foreground/40" />
        <div className={cn('h-full rounded-full', v.bar)} style={{ width: `${m.score * 100}%` }} />
      </div>
      <span className="w-9 text-right tabular">{Math.round(m.score * 100)}%</span>
    </div>
  )
}

function Recommendation({ pool }: { pool: StackPool }) {
  const picks = pool.maps.filter((m) => m.verdict === 'pick').slice(0, 2)
  const bans = pool.maps.filter((m) => m.verdict === 'ban').slice(-2)
  if (!picks.length && !bans.length) return <Notice tone="info">Явных фаворитов и аутсайдеров в пуле нет — карты примерно равны.</Notice>
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
      {picks.length > 0 && (
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground">Брать:</span>
          {picks.map((m) => (
            <MapChip key={m.map} map={m.map} />
          ))}
        </span>
      )}
      {bans.length > 0 && (
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground">Банить:</span>
          {bans.map((m) => (
            <MapChip key={m.map} map={m.map} />
          ))}
        </span>
      )}
    </div>
  )
}

function PoolTable({ pool, opponents }: { pool: StackPool; opponents?: OpponentMaps }) {
  const solo = pool.players.length === 1
  return (
    <div className="space-y-4">
      <div className="space-y-3 px-5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {solo ? (
            <span>Только {pool.players[0].nickname} — добавьте тиммейтов, чтобы учесть матчи, сыгранные вместе.</span>
          ) : (
            <span>
              {pool.players.map((p) => p.nickname).join(' + ')} · вместе <b className="text-foreground tabular">{pool.together.matches}</b> из последних {pool.together.history_window} матчей
              {pool.together.win_rate !== null && <>, WR {pct(pool.together.win_rate)}</>}
            </span>
          )}
          {pool.players.some((p) => p.errors.length) && <Badge variant="outline">неполные данные FACEIT</Badge>}
        </div>
        <Recommendation pool={pool} />
      </div>
      <Table>
        <THead>
          <TR>
            <TH className="pl-5">Карта</TH>
            <TH>Оценка</TH>
            {!solo && <TH className="text-right">Вместе</TH>}
            {pool.players.map((p) => (
              <TH key={p.player_id} className="text-right">
                {p.nickname}
              </TH>
            ))}
            {opponents && <TH className="text-right">Соперники</TH>}
            <TH className="pr-5">Итог</TH>
          </TR>
        </THead>
        <TBody>
          {pool.maps.map((m) => {
            const v = VERDICT[m.verdict]
            const opp = opponents?.[m.map]
            return (
              <TR key={m.map}>
                <TD className="pl-5">
                  <MapChip map={m.map} />
                </TD>
                <TD>
                  <Score m={m} />
                </TD>
                {!solo && (
                  <TD className="text-right text-xs tabular">{m.together_matches ? `${pct(m.together_win_rate)} · ${m.together_matches} м` : '—'}</TD>
                )}
                {m.players.map((p) => (
                  <TD key={p.player_id} className={cn('text-right text-xs tabular', m.inexperienced.includes(p.nickname) && 'text-critical-text')}>
                    <Hint content={`Lifetime: ${p.matches} матчей, WR ${pct(p.win_rate)} · последние: ${p.recent_matches} матчей, WR ${pct(p.recent_win_rate)}`}>
                      <span className="cursor-help">
                        {pct(p.win_rate)} · {p.matches} м
                      </span>
                    </Hint>
                  </TD>
                ))}
                {opponents && <TD className="text-right text-xs tabular">{opp ? `${pct(opp.winRate)} · ${opp.matches} м` : '—'}</TD>}
                <TD className="pr-5">
                  <Badge variant={v.variant}>
                    <v.icon /> {v.label}
                  </Badge>
                  {m.inexperienced.length > 0 && <span className="ml-1.5 text-[11px] text-critical-text">мало опыта</span>}
                  {m.confidence === 'low' && !m.inexperienced.length && <span className="ml-1.5 text-[11px] text-subtle-foreground">мало данных</span>}
                </TD>
              </TR>
            )
          })}
        </TBody>
      </Table>
      <p className="px-5 text-[11px] leading-relaxed text-subtle-foreground">{pool.method}</p>
    </div>
  )
}

/** Which maps suit this group best, from each player's record and the games they played together.
 * Meant for a Card with `px-0` content: the table runs edge to edge, text keeps the card padding. */
export function StackMapPool({ players, opponents }: { players: string[]; opponents?: OpponentMaps }) {
  const q = useStackMaps(players)
  return (
    <AsyncView
      query={q}
      notFound="Один из игроков не найден на FACEIT"
      skeleton={
        <LoadingSkeleton label="Считаем пул карт">
          <SkeletonTable rows={7} cols={players.length + 3} />
        </LoadingSkeleton>
      }
    >
      {(pool) => (
        <div className={cn(q.isPlaceholderData && 'opacity-60 transition-opacity')}>
          <PoolTable pool={pool} opponents={opponents} />
        </div>
      )}
    </AsyncView>
  )
}
