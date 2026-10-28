import { Target, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { type CoachGoal, type CoachOverview, useCoach, useCreateGoal, useDeleteGoal } from '@/entities/coach'
import { useSession } from '@/entities/session'
import { LoginButtons } from '@/features/auth'
import { cn } from '@/shared/lib/cn'
import { dateTime, fmt, mapName, pct } from '@/shared/lib/format'
import { AsyncView, axisProps, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, ChartTooltipBox, ConfirmButton, EmptyState, gridProps, LoadingSkeleton, Progress, Select, Skeleton, SkeletonCard, SkeletonChart, SkeletonText, Table, TBody, TD, TH, THead, TR } from '@/shared/ui'

function fmtMetric(meta: CoachOverview['metrics'][string] | undefined, v: number | null) {
  if (v === null || v === undefined || !meta) return '—'
  return meta.pct ? pct(v, 1) : v.toFixed(meta.digits)
}

function GoalCard({ g, meta }: { g: CoachGoal; meta: CoachOverview['metrics'][string] }) {
  const del = useDeleteGoal()
  const p = g.progress
  const frac = p.fraction === null ? 0 : Math.max(0, Math.min(1, p.fraction))
  return (
    <div className="animate-enter rounded-xl border p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-medium">
            {g.label}
            {g.map && ` · ${mapName(g.map)}`}
          </div>
          <div className="text-xs text-muted-foreground tabular">
            база {fmtMetric(meta, g.baseline)} ({g.baseline_n} матч.) → цель {fmtMetric(meta, g.target)} ({g.direction === 'up' ? 'выше' : 'ниже'} — лучше)
          </div>
        </div>
        <ConfirmButton size="icon" aria-label="Удалить цель" onConfirm={() => del.mutate(g.id)} loading={del.isPending}>
          <Trash2 />
        </ConfirmButton>
      </div>
      <Progress value={Math.round(frac * 100)} className="mt-3" />
      <div className="mt-1.5 flex justify-between text-xs text-muted-foreground">
        <span>
          сейчас: <b className="text-foreground tabular">{fmtMetric(meta, p.current)}</b> по {p.n_after} {meta.source === 'demo' ? 'демкам' : 'матчам'} после постановки
        </span>
        {p.reached === true ? <Badge variant="good">достигнута</Badge> : !p.enough_data ? <span>нужно ≥ 5 новых {meta.source === 'demo' ? 'демок' : 'матчей'}</span> : null}
      </div>
      <div className="mt-1 text-[11px] text-subtle-foreground">создана {dateTime(g.created_at)}</div>
    </div>
  )
}

function NewGoal({ data }: { data: CoachOverview }) {
  const create = useCreateGoal()
  const [metric, setMetric] = useState(data.suggestions[0]?.metric ?? 'entry_death_rate')
  const [map, setMap] = useState('de_mirage')
  const meta = data.metrics[metric]
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select label="Метрика" value={metric} onChange={setMetric} options={Object.entries(data.metrics).map(([k, v]) => ({ value: k, label: v.label }))} className="min-w-64" />
      {meta?.needs_map && (
        <Select label="Карта" value={map} onChange={setMap} options={['de_mirage', 'de_inferno', 'de_dust2', 'de_nuke', 'de_ancient', 'de_anubis', 'de_train'].map((m) => ({ value: m, label: mapName(m) }))} />
      )}
      <Button size="sm" onClick={() => create.mutate({ metric, map: meta?.needs_map ? map : null })} loading={create.isPending}>
        <Target /> Поставить цель
      </Button>
    </div>
  )
}

export function CoachPage() {
  const { data: session } = useSession()
  const coach = useCoach(Boolean(session?.authenticated))
  const create = useCreateGoal()
  if (!session?.authenticated)
    return (
      <EmptyState title="Коуч работает с вашим профилем">
        <div className="mt-2 space-y-3">
          <p>Войдите, чтобы приложение определило ваш FACEIT-профиль, ставило цели и отслеживало прогресс.</p>
          <LoginButtons returnTo="/coach" className="justify-center" />
        </div>
      </EmptyState>
    )
  return (
    <AsyncView query={coach} notFound="FACEIT-профиль для коучинга не найден" skeleton={<CoachSkeleton />}>
      {(d) => <Coach d={d} create={create} />}
    </AsyncView>
  )
}

function CoachSkeleton() {
  return (
    <LoadingSkeleton label="Готовим персональный разбор" className="space-y-4">
      <Skeleton className="h-6 w-72" />
      <Skeleton className="mt-2 h-3 w-[32rem] max-w-full" />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.4fr_1fr]">
        <SkeletonCard>
          <SkeletonChart height={224} />
        </SkeletonCard>
        <SkeletonCard>
          <SkeletonText lines={6} />
        </SkeletonCard>
      </div>
      <SkeletonCard bodyHeight={120} />
    </LoadingSkeleton>
  )
}

function Coach({ d, create }: { d: CoachOverview; create: ReturnType<typeof useCreateGoal> }) {
  const chart = [...d.weekly].reverse()
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Персональный коуч · {d.profile.nickname}</h1>
        <p className="text-sm text-muted-foreground">
          Выводы строятся из ваших матчей FACEIT ({d.insights.matches_used} со статистикой) и разобранных демок ({d.demos.length}). Без общих советов — только измеренные отклонения.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Форма по неделям</CardTitle>
            <CardDescription>Rating 1.0 по неделям (UTC); недели с &lt; 5 матчами не интерпретируются</CardDescription>
          </CardHeader>
          <CardContent>
            {chart.length < 2 ? (
              <EmptyState title="Недостаточно недель с матчами" />
            ) : (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chart} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
                    <CartesianGrid {...gridProps} />
                    <XAxis dataKey="week" {...axisProps} tickFormatter={(w: string) => w.split('-')[1]} />
                    <YAxis {...axisProps} domain={['auto', 'auto']} />
                    <Tooltip
                      content={({ active, payload }) => {
                        const p = active && payload?.[0]?.payload
                        return p ? (
                          <ChartTooltipBox
                            title={p.week}
                            rows={[
                              { label: 'Rating', value: fmt(p.rating), color: 'var(--series-1)' },
                              { label: 'Матчей', value: p.matches },
                              { label: 'WR', value: pct(p.win_rate) },
                              { label: 'ADR', value: fmt(p.adr, 1) },
                            ]}
                          />
                        ) : null
                      }}
                    />
                    <Line dataKey="rating" stroke="var(--series-1)" strokeWidth={2} dot={{ r: 4, fill: 'var(--series-1)', stroke: 'var(--card)', strokeWidth: 2 }} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="mt-3 divide-y text-sm">
              {d.weekly.slice(0, 4).map((w) => (
                <div key={w.week} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="font-medium">{w.week}</span>
                  <span className="text-xs text-muted-foreground tabular">
                    {w.matches} м · WR {pct(w.win_rate)} · R {fmt(w.rating)} · ADR {fmt(w.adr, 0)}
                  </span>
                  {w.notes && w.notes.length > 0 && <span className="w-full text-xs text-subtle-foreground">{w.notes.join('; ')}</span>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Что стоит тренировать</CardTitle>
            <CardDescription>Только метрики, где вы статистически ниже своих лобби</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {d.suggestions.length === 0 && <EmptyState title="Выраженных слабых мест не найдено" className="p-6">Нужна большая выборка или данные демок.</EmptyState>}
            {d.suggestions.map((s) => (
              <div key={s.metric} className="flex items-start justify-between gap-3 rounded-lg border p-3">
                <div>
                  <div className="text-sm font-medium">{s.label}</div>
                  <div className="text-xs text-muted-foreground">{s.why}</div>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => create.mutate({ metric: s.metric })}
                  loading={create.isPending && create.variables?.metric === s.metric}
                  disabled={create.isPending || d.goals.some((g) => g.metric === s.metric)}
                >
                  {d.goals.some((g) => g.metric === s.metric) ? 'Есть цель' : 'Цель'}
                </Button>
              </div>
            ))}
            <div className="flex flex-wrap gap-1.5 pt-2">
              {d.insights.strengths.map((s) => (
                <Badge key={s} variant="good">
                  {s}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader className="gap-3">
          <CardTitle>Цели</CardTitle>
          <CardDescription>Базовый уровень фиксируется при создании; прогресс считается только по матчам/демкам после этого момента.</CardDescription>
          <NewGoal data={d} />
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {d.goals.length === 0 ? <EmptyState title="Целей пока нет" className="p-6 md:col-span-2">Выберите метрику выше — базовый уровень зафиксируется в момент постановки.</EmptyState> : d.goals.map((g) => <GoalCard key={g.id} g={g} meta={d.metrics[g.metric]} />)}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Повторяющиеся ошибки в демках</CardTitle>
          <CardDescription>Паттерны, встречающиеся минимум в двух ваших демках (по SteamID {d.profile.steam_id ?? '—'})</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {d.mistakes.length === 0 ? (
            <EmptyState title={d.demos.length < 2 ? 'Нужно минимум 2 разобранные демки с вашим участием' : 'Повторяющихся ошибок не найдено'} />
          ) : (
            d.mistakes.map((m) => (
              <div key={m.kind} className="rounded-lg border border-critical/30 bg-critical/5 p-3 text-sm">
                {m.text}
              </div>
            ))
          )}
          {d.demos.length > 0 && (
            <Table>
              <THead>
                <TR>
                  <TH>Демка</TH>
                  <TH className="text-right">KAST</TH>
                  <TH className="text-right">ADR</TH>
                  <TH className="text-right">Rating</TH>
                  <TH className="text-right">Opening-смерти/р.</TH>
                  <TH className="text-right">Разменяно смертей</TH>
                </TR>
              </THead>
              <TBody>
                {d.demos.map((r) => (
                  <TR key={r.demo_id}>
                    <TD>
                      {mapName(r.map)} <span className="text-xs text-subtle-foreground">{dateTime(r.created_at)}</span>
                    </TD>
                    <TD className="text-right">{r.kast.toFixed(0)}%</TD>
                    <TD className="text-right">{r.adr.toFixed(0)}</TD>
                    <TD className={cn('text-right')}>{r.rating.toFixed(2)}</TD>
                    <TD className="text-right">{r.opening_death_rate.toFixed(2)}</TD>
                    <TD className="text-right">{pct(r.traded_death_rate)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
