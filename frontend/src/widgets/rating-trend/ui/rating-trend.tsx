import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from 'recharts'

import type { TrendPoint } from '@/entities/player'
import { dateTime, fmt, mapName } from '@/shared/lib/format'
import { axisProps, Card, CardContent, CardDescription, CardHeader, CardTitle, ChartTooltipBox, gridProps, Legend, Tabs, TabsList, TabsTrigger } from '@/shared/ui'

type Metric = 'rating' | 'adr' | 'kd'
const LABEL: Record<Metric, string> = { rating: 'Rating 1.0', adr: 'ADR', kd: 'K/D' }
const REF: Record<Metric, number> = { rating: 1, adr: 80, kd: 1 }

export function RatingTrend({ trend, nickname, search }: { trend: TrendPoint[]; nickname: string; search: string }) {
  const [metric, setMetric] = useState<Metric>('rating')
  const navigate = useNavigate()
  const data = trend.map((p, i) => {
    const window = trend.slice(Math.max(0, i - 4), i + 1).map((x) => (x[metric] ?? 0) as number)
    return { ...p, value: p[metric] ?? null, rolling: window.reduce((a, b) => a + b, 0) / window.length }
  })
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>Динамика формы</CardTitle>
          <CardDescription>По матчам от старых к новым · точка — матч, линия — скользящее среднее за 5 матчей · клик открывает матч</CardDescription>
        </div>
        <Tabs value={metric} onValueChange={(v) => setMetric(v as Metric)}>
          <TabsList>
            {(Object.keys(LABEL) as Metric[]).map((m) => (
              <TabsTrigger key={m} value={m}>
                {LABEL[m]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="idx" {...axisProps} interval="preserveStartEnd" minTickGap={24} />
              <YAxis {...axisProps} domain={['auto', 'auto']} width={44} />
              <ReferenceLine y={REF[metric]} stroke="var(--axis)" strokeWidth={1} />
              <Tooltip
                cursor={{ stroke: 'var(--axis)' }}
                content={({ active, payload }) => {
                  const p = active && payload?.[0]?.payload
                  if (!p) return null
                  return (
                    <ChartTooltipBox
                      title={`#${p.idx} · ${mapName(p.map)} · ${p.won === null ? '' : p.won ? 'Победа' : 'Поражение'}`}
                      rows={[
                        { label: LABEL[metric], value: fmt(p.value, metric === 'adr' ? 1 : 2), color: 'var(--series-1)' },
                        { label: 'Среднее (5)', value: fmt(p.rolling, metric === 'adr' ? 1 : 2), color: 'var(--series-2)' },
                        { label: 'Убийства', value: p.kills },
                        { label: 'Дата', value: dateTime(p.started_at) },
                      ]}
                    />
                  )
                }}
              />
              <Scatter
                dataKey="value"
                fill="var(--series-1)"
                stroke="var(--card)"
                strokeWidth={2}
                r={4}
                cursor="pointer"
                onClick={(d: { payload?: TrendPoint }) =>
                  d.payload && navigate(`/players/${encodeURIComponent(nickname)}/matches/${d.payload.match_id}${search}`)
                }
              />
              <Line dataKey="rolling" stroke="var(--series-2)" strokeWidth={2} dot={false} type="monotone" isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2">
          <Legend
            items={[
              { label: `${LABEL[metric]} за матч`, color: 'var(--series-1)' },
              { label: 'Скользящее среднее (5)', color: 'var(--series-2)' },
            ]}
          />
        </div>
      </CardContent>
    </Card>
  )
}
