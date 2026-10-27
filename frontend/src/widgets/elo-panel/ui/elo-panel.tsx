import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import type { EloReport } from '@/entities/player'
import { dateTime, pct, signed } from '@/shared/lib/format'
import { axisProps, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, ChartTooltipBox, EmptyState, gridProps, Legend, StatTile } from '@/shared/ui'

interface Point {
  x: number
  elo?: number
  median?: number
  band?: [number, number]
  date?: string | null
  delta?: number
  won?: boolean
}

export function EloPanel({ data }: { data: EloReport }) {
  const recon = data.reconstructed
  const proj = data.projection
  const points: Point[] = recon.map((r, i) => ({
    x: i - recon.length + 1,
    elo: r.elo_after,
    date: r.started_at,
    delta: r.delta,
    won: r.won,
  }))
  if (proj && !proj.relative) {
    if (points.length) points[points.length - 1] = { ...points[points.length - 1], median: proj.start ?? undefined, band: [proj.start!, proj.start!] }
    proj.series.forEach((s) => points.push({ x: s.step, median: s.p50, band: [s.p10, s.p90] }))
  }
  const ri = data.results_implied
  const pi = data.implied
  const last = proj?.series[proj.series.length - 1]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Официальный Elo"
          value={data.official.elo ?? '—'}
          hint={data.official.elo === null ? 'Нет в источнике данных' : data.official.source === 'synthetic' ? 'из синтетических данных' : 'из FACEIT'}
        />
        <StatTile
          label="Elo по результатам (оценка)"
          value={ri.available ? ri.estimate : '—'}
          hint={ri.available ? `80% интервал ${ri.ci80![0]}–${ri.ci80![1]} · ${ri.n_matches} матчей` : ri.reason}
        />
        <StatTile
          label="Elo по игре (оценка)"
          value={pi.available ? pi.estimate : '—'}
          hint={pi.available ? `80% интервал ${pi.ci80![0]}–${pi.ci80![1]} · лобби ${pi.lobby_avg_elo}` : pi.reason}
        />
        <StatTile
          label={`Прогноз через ${proj?.series.length ?? 30} матчей`}
          value={last ? (proj!.relative ? signed(last.p50, 0) : last.p50) : '—'}
          hint={last ? `80%: ${proj!.relative ? `${signed(last.p10, 0)}…${signed(last.p90, 0)}` : `${last.p10}–${last.p90}`} · WR ${pct(proj!.posterior_win_rate)}` : 'нужно ≥ 10 матчей'}
        />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>Траектория Elo: реконструкция и прогноз</CardTitle>
            <Badge variant="warn">Исследовательская оценка, не официальный рейтинг</Badge>
          </div>
          <CardDescription>
            Ось X — матчи относительно текущего (0). Слева — Elo, восстановленный назад от официального значения по правилу Elo (K = 50);
            справа — медиана и 80% интервал Monte Carlo прогноза.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {points.length === 0 ? (
            <EmptyState title="Недостаточно данных для траектории">
              Нужен официальный текущий Elo (FACEIT API) и история матчей. В реальном снимке старого бота Elo отсутствует.
              {proj?.relative && ` Относительный прогноз: медиана ${signed(last?.p50, 0)} Elo за ${proj.series.length} матчей.`}
            </EmptyState>
          ) : (
            <>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={points} margin={{ top: 8, right: 12, bottom: 0, left: -4 }}>
                    <CartesianGrid {...gridProps} />
                    <XAxis dataKey="x" type="number" domain={['dataMin', 'dataMax']} {...axisProps} />
                    <YAxis {...axisProps} domain={['auto', 'auto']} width={48} />
                    <ReferenceLine x={0} stroke="var(--axis)" label={{ value: 'сейчас', fill: 'var(--subtle-foreground)', fontSize: 11, position: 'insideTopRight' }} />
                    <Tooltip
                      content={({ active, payload }) => {
                        const p = active && (payload?.[0]?.payload as Point | undefined)
                        if (!p) return null
                        const rows = []
                        if (p.elo !== undefined) rows.push({ label: 'Elo (реконстр.)', value: p.elo, color: 'var(--series-1)' })
                        if (p.delta !== undefined) rows.push({ label: p.won ? 'Победа' : 'Поражение', value: signed(p.delta, 0) })
                        if (p.median !== undefined && p.x > 0) rows.push({ label: 'Медиана прогноза', value: p.median, color: 'var(--series-2)' })
                        if (p.band && p.x > 0) rows.push({ label: '80% интервал', value: `${p.band[0]}–${p.band[1]}` })
                        return <ChartTooltipBox title={p.x > 0 ? `+${p.x} матч(ей)` : p.date ? dateTime(p.date) : `матч ${p.x}`} rows={rows} />
                      }}
                    />
                    <Area dataKey="band" stroke="none" fill="var(--series-2)" fillOpacity={0.12} isAnimationActive={false} />
                    <Line dataKey="elo" stroke="var(--series-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
                    <Line dataKey="median" stroke="var(--series-2)" strokeWidth={2} dot={false} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2">
                <Legend
                  items={[
                    { label: 'Elo (реконструкция)', color: 'var(--series-1)' },
                    { label: 'Медиана прогноза', color: 'var(--series-2)' },
                    { label: '80% интервал (заливка)', color: 'var(--series-2)', dashed: true },
                  ]}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Как считаются оценки</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">{data.method.trim()}</pre>
          {data.snapshots.length > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              Зафиксированные официальные значения: {data.snapshots.map((s) => `${s.elo} (${dateTime(s.at)})`).join(', ')}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
