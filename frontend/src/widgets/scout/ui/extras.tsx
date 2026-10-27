import { CheckCircle2, Clock, ExternalLink, Lock, RefreshCw, XCircle } from 'lucide-react'
import { Link } from 'react-router-dom'

import { useResolvePredictions } from '@/entities/prediction'
import type { ScoutJob, ScoutReport } from '@/entities/scout'
import { useSession } from '@/entities/session'
import { MapChip } from '@/entities/match'
import { cn } from '@/shared/lib/cn'
import { dateTime, mapName, pct } from '@/shared/lib/format'
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Hint, Table, TBody, TD, TH, THead, TR } from '@/shared/ui'

import { FACTION_COLOR, orderedFactions, teamLabel } from './shared'

const PHASE: Record<ScoutReport['phase'], { label: string; variant: 'brand' | 'warn' | 'good' | 'bad' | 'default' }> = {
  pre: { label: 'До начала матча', variant: 'brand' },
  live: { label: 'Матч идёт', variant: 'warn' },
  post: { label: 'Матч завершён', variant: 'good' },
  dead: { label: 'Матч отменён', variant: 'bad' },
  unknown: { label: 'Статус неизвестен', variant: 'default' },
}

export function ScoutHeader({ job, onRefresh, refreshing }: { job: ScoutJob; onRefresh: () => void; refreshing: boolean }) {
  const r = job.report!
  const ph = PHASE[r.phase]
  const [l, rr] = orderedFactions(r)
  return (
    <div className="relative overflow-hidden rounded-2xl border bg-card p-5">
      <div className="pointer-events-none absolute -top-20 -right-16 size-64 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant={ph.variant}>{ph.label}</Badge>
            {r.map ? <MapChip map={r.map} /> : <span>карта не выбрана</span>}
            {r.competition && <span>· {r.competition}</span>}
            {r.region && <span>· {r.region}</span>}
          </div>
          <h1 className="mt-2 flex flex-wrap items-center gap-x-3 text-xl font-semibold tracking-tight md:text-2xl">
            <span className="flex items-center gap-2">
              <span className="inline-block size-3 rounded-full" style={{ background: FACTION_COLOR[l] }} />
              {teamLabel(r, l)}
            </span>
            <span className="text-subtle-foreground">vs</span>
            <span className="flex items-center gap-2">
              {teamLabel(r, rr)}
              <span className="inline-block size-3 rounded-full" style={{ background: FACTION_COLOR[rr] }} />
            </span>
          </h1>
          <div className="mt-1 text-xs text-subtle-foreground">
            Сгенерировано {dateTime(r.generated_at)} · {r.freshness.requests} запросов к FACEIT ({r.freshness.from_cache} из кэша)
            {r.freshness.oldest && ` · самые старые данные от ${dateTime(r.freshness.oldest)}`} · {r.algo_version}
          </div>
          {r.freshness.stale && (
            <div className="mt-1 text-xs text-critical-text">FACEIT API был недоступен — часть данных взята из сохранённого кэша.</div>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {r.faceit_url && (
            <Button asChild variant="secondary" size="sm">
              <a href={r.faceit_url} target="_blank" rel="noreferrer">
                Комната <ExternalLink />
              </a>
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={onRefresh} disabled={refreshing}>
            <RefreshCw className={cn(refreshing && 'animate-spin')} /> Обновить
          </Button>
        </div>
      </div>
    </div>
  )
}

export function PredictionPanel({ job }: { job: ScoutJob }) {
  const { data: session } = useSession()
  const resolve = useResolvePredictions()
  const p = job.prediction
  const r = job.report!
  if (!p) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="size-4" /> Снимок прогноза
          </CardTitle>
          <CardDescription>
            {r.phase === 'post'
              ? 'Матч уже завершён: прогноз задним числом не создаётся.'
              : session?.authenticated
                ? 'Снимок не создан.'
                : 'Прогноз сохраняется для анонимного отчёта, но проверять его удобнее после входа.'}
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }
  const pf1 = p.payload.elo_expectation_faction1
  const o = p.outcome
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lock className="size-4" /> Снимок прогноза зафиксирован
        </CardTitle>
        <CardDescription>
          {dateTime(p.created_at)} · статус матча при прогнозе: {p.match_status_at_prediction}
          {!p.pre_match && ' (уже шёл — не учитывается в оценке качества)'} · {p.algo_version} · hash {p.input_hash.slice(0, 10)}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg bg-card-2/50 p-2">
            Elo-ожидание {r.teams.faction1.name}: <b className="tabular">{pf1 === null ? '—' : pct(pf1)}</b>
          </div>
          <div className="rounded-lg bg-card-2/50 p-2">
            Фаворит: <b>{p.payload.favoured ? r.teams[p.payload.favoured].name : 'нет (≈50/50)'}</b>
          </div>
        </div>
        {o ? (
          <div className={cn('rounded-lg border p-3', o.favoured_correct ? 'border-good/40 bg-good/5' : o.favoured_correct === false ? 'border-critical/40 bg-critical/5' : '')}>
            <div className="flex items-center gap-2 font-medium">
              {o.favoured_correct ? <CheckCircle2 className="size-4 text-good-text" /> : o.favoured_correct === false ? <XCircle className="size-4 text-critical-text" /> : <Clock className="size-4" />}
              {o.winner ? `Победила ${r.teams[o.winner].name}` : `Матч: ${o.status}`}
              {o.favoured_correct !== undefined && o.favoured_correct !== null && (o.favoured_correct ? ' — фаворит угадан' : ' — фаворит не угадан')}
            </div>
            {o.brier !== undefined && (
              <div className="mt-1 text-xs text-muted-foreground tabular">
                Brier {o.brier} (базовая линия 0.25) · вероятность, данная победителю: {pct(o.p_winner ?? null)}
              </div>
            )}
            {o.signals && o.signals.risk.length > 0 && (
              <div className="mt-1 text-xs text-muted-foreground">
                Помеченные риском игроки: {o.signals.risk.map((s) => `#${s.adr_rank} по ADR`).join(', ')} (случайный игрок в топ-3 с вероятностью 30%)
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>Результат ещё не проверен.</span>
            {session?.authenticated && (
              <Button size="sm" variant="secondary" onClick={() => resolve.mutate()} disabled={resolve.isPending}>
                Проверить результат
              </Button>
            )}
          </div>
        )}
        <Link to="/predictions" className="text-xs text-muted-foreground underline-offset-4 hover:underline">
          Все прогнозы и метрики качества →
        </Link>
      </CardContent>
    </Card>
  )
}

export function MapPool({ r }: { r: ScoutReport }) {
  if (r.map || r.map_pool.length === 0) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle>Пул карт (до выбора карты)</CardTitle>
        <CardDescription>Суммарные lifetime-матчи и win rate на карте по составу. Это опыт команд, не рекомендация пикать/банить.</CardDescription>
      </CardHeader>
      <CardContent className="px-0 pb-2">
        <Table>
          <THead>
            <TR>
              <TH className="pl-5">Карта</TH>
              <TH className="text-right">Вы: матчей</TH>
              <TH className="text-right">Вы: WR</TH>
              <TH className="text-right">Соперники: матчей</TH>
              <TH className="pr-5 text-right">Соперники: WR</TH>
            </TR>
          </THead>
          <TBody>
            {r.map_pool.map((m) => (
              <TR key={m.map}>
                <TD className="pl-5">{mapName(m.map)}</TD>
                <TD className="text-right">{m.us_matches}</TD>
                <TD className="text-right">{pct(m.us_win_rate)}</TD>
                <TD className="text-right">{m.them_matches}</TD>
                <TD className="pr-5 text-right">{pct(m.them_win_rate)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </CardContent>
    </Card>
  )
}

const INST: Record<string, { label: string; variant: 'good' | 'warn' | 'bad' | 'outline' }> = {
  low: { label: 'низкий риск', variant: 'good' },
  moderate: { label: 'умеренный риск', variant: 'warn' },
  elevated: { label: 'повышенный риск', variant: 'bad' },
  insufficient_data: { label: 'мало данных', variant: 'outline' },
}

export function Stability({ r }: { r: ScoutReport }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Стабильность составов</CardTitle>
        <CardDescription>{r.teams.faction1.instability.note}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        {orderedFactions(r).map((f) => {
          const i = r.teams[f].instability
          return (
            <div key={f} className="rounded-lg border p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium">{teamLabel(r, f)}</span>
                <Badge variant={INST[i.level].variant}>{INST[i.level].label}</Badge>
              </div>
              {i.signals.length === 0 ? (
                <div className="mt-2 text-xs text-muted-foreground">Признаков нестабильности в статистике нет.</div>
              ) : (
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {i.signals.map((s) => (
                    <li key={s.key}>
                      <Hint content={s.evidence === 'fact' ? 'Факт из статистики' : 'Статистическая оценка'}>
                        <span>• {s.text}</span>
                      </Hint>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

export function PostMatch({ r }: { r: ScoutReport }) {
  if (r.phase !== 'post' || !r.result) return null
  const players = Object.values(r.teams).flatMap((t) => t.players)
  const rows = players
    .map((p) => ({ p, s: r.result!.players[p.player_id] }))
    .filter((x) => x.s)
    .sort((a, b) => Number(b.s.ADR ?? 0) - Number(a.s.ADR ?? 0))
  return (
    <Card className="border-good/30">
      <CardHeader>
        <CardTitle>Итог матча</CardTitle>
        <CardDescription>
          {r.result.winner ? `Победила ${r.teams[r.result.winner].name}` : 'Победитель неизвестен'}
          {r.result.score && ` · счёт ${r.result.score}`}. Сравните с брифингом выше: прогноз не пересчитывается задним числом.
        </CardDescription>
      </CardHeader>
      {rows.length > 0 && (
        <CardContent className="px-0 pb-2">
          <Table>
            <THead>
              <TR>
                <TH className="pl-5">Игрок</TH>
                <TH className="text-right">K</TH>
                <TH className="text-right">D</TH>
                <TH className="text-right">ADR</TH>
                <TH className="pr-5 text-right">Угроза до матча</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map(({ p, s }) => (
                <TR key={p.player_id}>
                  <TD className="pl-5">{p.nickname}</TD>
                  <TD className="text-right">{s.Kills}</TD>
                  <TD className="text-right">{s.Deaths}</TD>
                  <TD className="text-right">{s.ADR ?? '—'}</TD>
                  <TD className="pr-5 text-right">#{p.threat.rank}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      )}
    </Card>
  )
}
