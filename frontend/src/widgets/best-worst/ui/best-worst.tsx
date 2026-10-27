import { Link } from 'react-router-dom'

import { MapChip, ResultPill } from '@/entities/match'
import type { BestWorst as BW, MatchRow } from '@/entities/player'
import { dateTime, fmt, pct } from '@/shared/lib/format'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Hint, Legend } from '@/shared/ui'

function MatchCard({ m, nickname, search, tone }: { m: MatchRow; nickname: string; search: string; tone: 'best' | 'worst' }) {
  return (
    <Link
      to={`/players/${encodeURIComponent(nickname)}/matches/${m.match_id}${search}`}
      className="block rounded-lg border bg-card-2/40 p-3 transition-colors hover:bg-card-2"
    >
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="flex items-center gap-2">
          <ResultPill won={m.won} />
          <MapChip map={m.map} />
          <span className="text-muted-foreground">{m.score_for !== null ? `${m.score_for}:${m.score_against}` : ''}</span>
        </span>
        <span className={tone === 'best' ? 'font-semibold text-good-text' : 'font-semibold text-critical-text'}>{fmt(m.rating)}</span>
      </div>
      <div className="mt-2 grid grid-cols-4 gap-2 text-xs text-muted-foreground tabular">
        <span>
          K/D/A <b className="text-foreground">{m.kills}/{m.deaths}/{m.assists}</b>
        </span>
        <span>
          ADR <b className="text-foreground">{fmt(m.adr, 0)}</b>
        </span>
        <span>
          HS <b className="text-foreground">{m.hs_pct}%</b>
        </span>
        <span>{m.party_size > 1 ? `пати ${m.party_size}` : 'соло'}</span>
      </div>
      <div className="mt-1 text-[11px] text-subtle-foreground">{dateTime(m.started_at)}</div>
    </Link>
  )
}

/** Dumbbell per metric on its own scale: worst ● — best ●, tick = all-match average. */
function Dumbbell({ row }: { row: BW['comparison'][number] }) {
  const lo = Math.min(row.best, row.worst, row.all)
  const hi = Math.max(row.best, row.worst, row.all)
  const pad = (hi - lo) * 0.15 || 1
  const x = (v: number) => ((v - (lo - pad)) / (hi - lo + 2 * pad)) * 100
  const isRate = row.metric === 'entry_success'
  const f = (v: number) => (isRate ? pct(v) : fmt(v, row.metric === 'adr' || row.metric === 'hs_pct' ? 1 : 2))
  return (
    <div className="grid grid-cols-[140px_1fr_120px] items-center gap-3 py-2 text-sm">
      <span className="text-muted-foreground">{row.label}</span>
      <Hint content={`Лучшие: ${f(row.best)} · Худшие: ${f(row.worst)} · Все матчи: ${f(row.all)}`}>
        <div className="relative h-5" role="img" aria-label={`${row.label}: лучшие ${f(row.best)}, худшие ${f(row.worst)}`}>
          <div className="absolute top-1/2 h-0.5 -translate-y-1/2 rounded bg-[var(--axis)]" style={{ left: `${Math.min(x(row.best), x(row.worst))}%`, width: `${Math.abs(x(row.best) - x(row.worst))}%` }} />
          <div className="absolute top-0.5 h-4 w-0.5 bg-subtle-foreground" style={{ left: `${x(row.all)}%` }} />
          <div className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-series-2" style={{ left: `${x(row.worst)}%` }} />
          <div className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-series-1" style={{ left: `${x(row.best)}%` }} />
        </div>
      </Hint>
      <span className="text-right text-xs tabular text-muted-foreground">
        <b className="text-foreground">{f(row.best)}</b> vs {f(row.worst)}
      </span>
    </div>
  )
}

export function BestWorst({ data, nickname, search }: { data: BW; nickname: string; search: string }) {
  if (data.n < 2) return <EmptyState title="Нужно минимум 2 матча со статистикой" />
  const c = data.context
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1.2fr]">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
        <Card>
          <CardHeader>
            <CardTitle>Лучшие матчи</CardTitle>
            <CardDescription>Топ по Rating 1.0</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.best.map((m) => (
              <MatchCard key={m.match_id} m={m} nickname={nickname} search={search} tone="best" />
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Худшие матчи</CardTitle>
            <CardDescription>Минимальный Rating 1.0</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.worst.map((m) => (
              <MatchCard key={m.match_id} m={m} nickname={nickname} search={search} tone="worst" />
            ))}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Чем отличаются лучшие игры от худших</CardTitle>
          <CardDescription>Средние значения метрик; у каждой метрики своя шкала</CardDescription>
          <Legend
            items={[
              { label: 'Лучшие', color: 'var(--series-1)' },
              { label: 'Худшие', color: 'var(--series-2)' },
              { label: 'Все матчи (риска)', color: 'var(--subtle-foreground)' },
            ]}
          />
        </CardHeader>
        <CardContent>
          <div className="divide-y">
            {data.comparison.map((r) => (
              <Dumbbell key={r.metric} row={r} />
            ))}
          </div>
          {c && (
            <div className="mt-4 grid gap-2 rounded-lg bg-card-2/50 p-3 text-xs text-muted-foreground sm:grid-cols-2">
              <div>
                Победы: лучшие <b className="text-foreground">{pct(c.best_win_rate)}</b>, худшие <b className="text-foreground">{pct(c.worst_win_rate)}</b>
              </div>
              <div>
                Доля пати: лучшие <b className="text-foreground">{pct(c.best_party_share)}</b>, худшие <b className="text-foreground">{pct(c.worst_party_share)}</b>
              </div>
            </div>
          )}
          {data.method && <p className="mt-3 text-xs text-subtle-foreground">{data.method}</p>}
        </CardContent>
      </Card>
    </div>
  )
}
