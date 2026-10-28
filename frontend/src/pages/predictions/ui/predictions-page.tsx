import { CheckCircle2, Clock, XCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { type PredictionMetrics, usePredictionMetrics, usePredictions, useResolvePredictions } from '@/entities/prediction'
import { useSession } from '@/entities/session'
import { LoginButtons } from '@/features/auth'
import { dateTime, pct } from '@/shared/lib/format'
import { AsyncView, axisProps, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, ChartTooltipBox, EmptyState, gridProps, Legend, LoadingSkeleton, Notice, OfflineState, SkeletonCard, SkeletonChart, SkeletonTable, SkeletonTiles, StatTile, Table, TBody, TD, TH, THead, TR } from '@/shared/ui'
import { notify } from '@/shared/lib/notify'

export function PredictionsPage() {
  const { data: session } = useSession()
  const authed = Boolean(session?.authenticated)
  const list = usePredictions(authed)
  const m = usePredictionMetrics(authed)
  const resolve = useResolvePredictions()
  if (!authed)
    return (
      <EmptyState title="Проверка прогнозов привязана к аккаунту">
        <LoginButtons returnTo="/predictions" className="mt-3 justify-center" />
      </EmptyState>
    )
  const check = () =>
    resolve.mutate(undefined, {
      onSuccess: (r) =>
        r.resolved > 0
          ? notify.success(`Закрыто прогнозов: ${r.resolved}`, { description: `Проверено матчей: ${r.checked}. Метрики обновлены.` })
          : notify.info('Новых результатов нет', { description: r.checked ? `Проверено матчей: ${r.checked} — ещё не завершены.` : 'Все прогнозы уже сверены с результатами.' }),
    })
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Проверка прогнозов</h1>
          <p className="text-sm text-muted-foreground">
            Каждый предматчевый снимок хранится неизменным; после матча он сравнивается с результатом. Никакого «самообучения» — только прозрачные метрики.
          </p>
        </div>
        <Button variant="secondary" onClick={check} loading={resolve.isPending}>
          {resolve.isPending ? 'Проверяем…' : 'Проверить завершённые матчи'}
        </Button>
      </div>
      {resolve.data && <div className="animate-fade-in text-xs text-muted-foreground">Проверено {resolve.data.checked}, закрыто {resolve.data.resolved}.</div>}
      <AsyncView query={m} skeleton={<MetricsSkeleton />}>
        {(d) => <Metrics d={d} />}
      </AsyncView>
      <PredictionList list={list} />
    </div>
  )
}

function MetricsSkeleton() {
  return (
    <LoadingSkeleton label="Считаем метрики прогнозов" className="space-y-4">
      <SkeletonTiles count={4} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <SkeletonCard>
          <SkeletonChart height={224} />
        </SkeletonCard>
        <SkeletonCard>
          <SkeletonChart height={224} />
        </SkeletonCard>
      </div>
    </LoadingSkeleton>
  )
}

function Metrics({ d }: { d: PredictionMetrics }) {
  const enough = d.scored >= d.min_for_conclusions
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Проверено прогнозов" value={d?.scored ?? 0} hint={enough ? 'достаточно для выводов' : `выводы — от ${d?.min_for_conclusions ?? 30}`} />
        <StatTile label="Brier score" value={d?.brier ?? '—'} hint="ниже — лучше; монетка = 0.25" />
        <StatTile label="Точность фаворита" value={pct(d?.favourite_accuracy ?? null)} hint={`n = ${d?.favourite_n ?? 0}`} />
        <StatTile label="Skill vs монетка" value={d?.skill_vs_baseline === undefined ? '—' : `${(d.skill_vs_baseline * 100).toFixed(1)}%`} hint="1 − Brier/0.25" />
      </div>
      {!enough && <Notice tone="warning">Пока проверено меньше {d.min_for_conclusions} прогнозов — метрики сильно зависят от случая и не говорят о качестве модели.</Notice>}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Калибровка Elo-ожидания</CardTitle>
            <CardDescription>Предсказанная и фактическая доля побед faction1 по корзинам вероятности</CardDescription>
            <Legend items={[{ label: 'Предсказано', color: 'var(--series-2)' }, { label: 'Фактически', color: 'var(--series-1)' }]} />
          </CardHeader>
          <CardContent>
            {!d?.calibration?.length ? (
              <EmptyState title="Нет проверенных прогнозов" />
            ) : (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={d.calibration} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                    <CartesianGrid {...gridProps} />
                    <XAxis dataKey="bin" {...axisProps} />
                    <YAxis {...axisProps} domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)}`} />
                    <Tooltip
                      cursor={{ fill: 'var(--card-2)' }}
                      content={({ active, payload }) => {
                        const p = active && payload?.[0]?.payload
                        return p ? (
                          <ChartTooltipBox
                            title={p.bin}
                            rows={[
                              { label: 'Предсказано', value: pct(p.predicted), color: 'var(--series-2)' },
                              { label: 'Фактически', value: pct(p.observed), color: 'var(--series-1)' },
                              { label: 'n', value: p.n },
                            ]}
                          />
                        ) : null
                      }}
                    />
                    <Bar dataKey="predicted" fill="var(--series-2)" radius={[4, 4, 0, 0]} maxBarSize={16} />
                    <Bar dataKey="observed" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={16} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Brier score по мере накопления</CardTitle>
            <CardDescription>Скользящее среднее по всем проверенным прогнозам; линия 0.25 — уровень монетки</CardDescription>
          </CardHeader>
          <CardContent>
            {!d?.cumulative?.length ? (
              <EmptyState title="Нет данных" />
            ) : (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={d.cumulative} margin={{ top: 8, right: 12, bottom: 0, left: -16 }}>
                    <CartesianGrid {...gridProps} />
                    <XAxis dataKey="n" {...axisProps} />
                    <YAxis {...axisProps} domain={[0, 0.5]} />
                    <ReferenceLine y={0.25} stroke="var(--axis)" />
                    <Tooltip content={({ active, payload }) => (active && payload?.[0] ? <ChartTooltipBox title={`после ${payload[0].payload.n}`} rows={[{ label: 'Brier', value: payload[0].payload.brier }]} /> : null)} />
                    <Line dataKey="brier" stroke="var(--series-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Полезность сигналов</CardTitle>
          <CardDescription>{d?.signals.note}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm md:grid-cols-3">
          <div>
            Помеченные риском игроки в топ-3 по ADR: <b>{pct(d?.signals.risk_flag_top3_rate ?? null)}</b> (n = {d?.signals.risk_flags ?? 0})
          </div>
          <div>
            «Главная угроза» в топ-3 по ADR: <b>{pct(d?.signals.threat_top3_rate ?? null)}</b> (n = {d?.signals.threats ?? 0})
          </div>
          <div>
            Ваши отзывы: ✓ {d?.feedback.by_verdict.correct ?? 0} · ✗ {d?.feedback.by_verdict.incorrect ?? 0} · ? {d?.feedback.by_verdict.unsure ?? 0} (хранятся отдельно, не как факты)
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function PredictionList({ list }: { list: ReturnType<typeof usePredictions> }) {
  return (
      <Card>
        <CardHeader>
          <CardTitle>Все прогнозы</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-2">
          {list.isPending && list.fetchStatus === 'paused' ? (
            <div className="px-5 pb-3">
              <OfflineState />
            </div>
          ) : list.isPending ? (
            <LoadingSkeleton label="Загружаем прогнозы">
              <SkeletonTable rows={5} cols={6} />
            </LoadingSkeleton>
          ) : !list.data?.length ? (
            <div className="px-5 pb-3">
              <EmptyState title="Прогнозов пока нет">Запустите разведку предстоящего матча — снимок прогноза сохранится автоматически.</EmptyState>
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH className="pl-5">Создан</TH>
                  <TH>Матч</TH>
                  <TH className="text-right">P(faction1)</TH>
                  <TH>Фаворит</TH>
                  <TH>Итог</TH>
                  <TH className="pr-5 text-right">Brier</TH>
                </TR>
              </THead>
              <TBody>
                {list.data.map((p) => (
                  <TR key={p.id}>
                    <TD className="pl-5 text-xs text-muted-foreground">
                      {dateTime(p.created_at)} {!p.pre_match && '(во время матча)'}
                    </TD>
                    <TD>
                      <Link to={`/scout/${p.scout_id}`} className="font-mono text-xs hover:underline">
                        {p.match_id.slice(0, 13)}…
                      </Link>
                    </TD>
                    <TD className="text-right">{pct(p.payload.elo_expectation_faction1)}</TD>
                    <TD className="text-xs">{p.payload.favoured ?? '≈50/50'}</TD>
                    <TD>
                      {!p.outcome ? (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="size-3.5" /> ожидает
                        </span>
                      ) : p.outcome.favoured_correct ? (
                        <span className="inline-flex items-center gap-1 text-xs text-good-text">
                          <CheckCircle2 className="size-3.5" /> угадан
                        </span>
                      ) : p.outcome.favoured_correct === false ? (
                        <span className="inline-flex items-center gap-1 text-xs text-critical-text">
                          <XCircle className="size-3.5" /> не угадан
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">{p.outcome.status}</span>
                      )}
                    </TD>
                    <TD className="pr-5 text-right">{p.outcome?.brier ?? '—'}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
  )
}
