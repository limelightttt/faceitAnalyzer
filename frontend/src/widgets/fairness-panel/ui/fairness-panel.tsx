import { RefreshCw, Scale } from 'lucide-react'
import { useState } from 'react'

import { type FairnessResult, useFairness, useStartFairness } from '@/entities/player'
import { FairnessBadge } from '@/entities/scout'
import { cn } from '@/shared/lib/cn'
import { dateTime, mapName, pct } from '@/shared/lib/format'
import { useSingleFlight } from '@/shared/lib/use-single-flight'
import { AsyncView, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, InlineError, Progress, Skeleton, Table, TBody, TD, TH, THead, TR } from '@/shared/ui'

const HEADLINE = {
  anomaly: 'border-critical/40 bg-critical/[0.07] text-critical-text',
  lean: 'border-warning/50 bg-warning/10 text-foreground',
  none: 'border-good/30 bg-good/5 text-good-text',
} as const

/** Which side got the edge in the player's recent matches: a verdict per match and a test of the split. */
export function FairnessPanel({ nickname }: { nickname: string }) {
  const report = useFairness(nickname)
  const start = useStartFairness(nickname)
  const once = useSingleFlight()
  const run = (refresh: boolean) => once(() => start.mutateAsync(refresh))
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Scale className="size-4" /> Честность матчей
        </CardTitle>
        <CardDescription>
          Были ли последние 30 матчей равными: реальный шанс с поправкой на свежие аккаунты, смурф-признаки, пачки с разбросом Elo, стаки против соло. И главное — на чьей стороне эти перекосы оказываются чаще.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <AsyncView query={report} skeleton={<Skeleton className="h-20 w-full" />}>
          {(r) =>
            !r ? (
              <Button onClick={() => run(false)} loading={start.isPending}>
                <Scale /> Проверить последние 30 матчей
              </Button>
            ) : r.status === 'running' ? (
              <div className="space-y-2" role="status">
                <p className="text-sm">Проверяем аккаунты всех игроков из ваших матчей — в первый раз это несколько минут, потом из кэша.</p>
                <Progress value={Math.round(r.progress * 100)} />
              </div>
            ) : r.status === 'error' || !r.result ? (
              <div className="space-y-2">
                <InlineError error={new Error(r.error ?? 'Проверка не завершилась')} />
                <Button size="sm" variant="secondary" onClick={() => run(true)} loading={start.isPending}>
                  <RefreshCw /> Запустить снова
                </Button>
              </div>
            ) : (
              <Result res={r.result} at={r.created_at} rerun={() => run(true)} pending={start.isPending} />
            )
          }
        </AsyncView>
        <InlineError error={start.error} />
      </CardContent>
    </Card>
  )
}

function Result({ res, at, rerun, pending }: { res: FairnessResult; at: string; rerun: () => void; pending: boolean }) {
  const [all, setAll] = useState(false)
  const rows = all ? res.rows : res.rows.filter((x) => x.code !== 'even')
  return (
    <div className="space-y-4">
      <div className={cn('rounded-lg border px-4 py-3', HEADLINE[res.code])} role={res.code === 'anomaly' ? 'alert' : undefined}>
        <div className={cn('font-semibold', res.code === 'anomaly' ? 'text-base tracking-wide' : 'text-sm')}>{res.title}</div>
        <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
          {res.facts.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      </div>
      <p className="text-[11px] text-subtle-foreground">{res.note}</p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          Проверено {dateTime(at)}: {res.matches} матчей, {res.accounts} аккаунтов
          {res.accounts_missing > 0 && ` (по ${res.accounts_missing} FACEIT не ответил)`}
        </span>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => setAll((v) => !v)}>
            {all ? 'Только неравные' : `Все матчи (${res.rows.length})`}
          </Button>
          <Button size="sm" variant="secondary" onClick={rerun} loading={pending}>
            <RefreshCw /> Проверить заново
          </Button>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Неравных матчей нет.</p>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Матч</TH>
              <TH>Итог</TH>
              <TH>Вердикт</TH>
              <TH className="text-right">Шанс: реальный / по Elo</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((m) => (
              <TR key={m.match_id}>
                <TD>
                  {mapName(m.map)} <span className="text-xs text-subtle-foreground">{dateTime(m.started_at)}</span>
                </TD>
                <TD className={cn('tabular', m.won ? 'text-good-text' : m.won === false ? 'text-critical-text' : '')}>{m.score ?? (m.won ? 'победа' : 'поражение')}</TD>
                <TD>
                  <FairnessBadge v={m} />
                  {[...m.against, ...m.favour].map((x) => (
                    <div key={x} className="mt-1 max-w-xl text-[11px] text-muted-foreground">
                      {x}
                    </div>
                  ))}
                </TD>
                <TD className="text-right tabular">
                  {pct(m.chance_real)} / {pct(m.chance_elo)}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  )
}
