import { CircleMinus, CirclePlus, Info } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import type { DemoAnalysis, DemoPlayer } from '@/entities/demo'
import { axisProps, Card, CardContent, CardDescription, CardHeader, CardTitle, ChartTooltipBox, EmptyState, gridProps, Legend, Select } from '@/shared/ui'

const METRICS: { label: string; get: (p: DemoPlayer) => number; fmt: (v: number) => string }[] = [
  { label: 'Rating', get: (p) => p.rating, fmt: (v) => v.toFixed(2) },
  { label: 'ADR', get: (p) => p.adr, fmt: (v) => v.toFixed(0) },
  { label: 'KAST', get: (p) => p.kast, fmt: (v) => `${v.toFixed(0)}%` },
  { label: 'HS%', get: (p) => p.hs_pct, fmt: (v) => `${v.toFixed(0)}%` },
  { label: 'Opening K-D', get: (p) => p.opening_kills - p.opening_deaths, fmt: (v) => `${v > 0 ? '+' : ''}${Number.isInteger(v) ? v : v.toFixed(1)}` },
  { label: 'Разменяно смертей', get: (p) => (p.deaths ? (100 * p.traded_deaths) / p.deaths : 0), fmt: (v) => `${v.toFixed(0)}%` },
  { label: 'Гранат за раунд', get: (p) => (p.flashes + p.smokes + p.he + p.molotovs) / Math.max(p.rounds, 1), fmt: (v) => v.toFixed(1) },
  { label: 'Ослеплено врагов', get: (p) => p.enemies_flashed, fmt: (v) => v.toFixed(0) },
]

function Comparison({ p, others }: { p: DemoPlayer; others: DemoPlayer[] }) {
  return (
    <div className="space-y-2">
      {METRICS.map((m) => {
        const v = m.get(p)
        const avg = others.reduce((s, o) => s + m.get(o), 0) / Math.max(others.length, 1)
        const all = [...others.map(m.get), v]
        const lo = Math.min(0, ...all)
        const hi = Math.max(...all) || 1
        const x = (val: number) => ((val - lo) / (hi - lo || 1)) * 100
        return (
          <div key={m.label} className="grid grid-cols-[130px_1fr_92px] items-center gap-3 text-sm">
            <span className="text-muted-foreground">{m.label}</span>
            <div className="relative h-4" role="img" aria-label={`${m.label}: ${m.fmt(v)}, лобби ${m.fmt(avg)}`}>
              <div className="absolute top-1/2 h-1.5 w-full -translate-y-1/2 rounded-full bg-card-2" />
              <div className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-series-1" style={{ left: `${x(Math.min(0, v))}%`, width: `${Math.abs(x(v) - x(0))}%` }} />
              <div className="absolute top-0 h-4 w-0.5 rounded bg-series-2" style={{ left: `${x(avg)}%` }} />
            </div>
            <span className="text-right text-xs tabular">
              <b>{m.fmt(v)}</b> <span className="text-subtle-foreground">/ {m.fmt(avg)}</span>
            </span>
          </div>
        )
      })}
      <Legend items={[{ label: 'Игрок', color: 'var(--series-1)' }, { label: 'Среднее остальных 9 (риска)', color: 'var(--series-2)' }]} />
    </div>
  )
}

export function DemoPlayerInsights({ data, focus, onFocus }: { data: DemoAnalysis; focus: string | null; onFocus: (s: string) => void }) {
  const p = data.players.find((x) => x.steamid === focus)
  const options = data.players.map((x) => ({ value: x.steamid, label: x.name }))
  const perRound = data.rounds.map((r) => ({
    round: r.number,
    kills: r.kills.filter((k) => k.attacker === focus && !k.team_kill && k.victim !== focus).length,
    died: r.kills.some((k) => k.victim === focus),
  }))
  const insights = focus ? data.insights[focus] ?? [] : []
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>Разбор игрока</CardTitle>
          <CardDescription>Сравнение с остальными 9 игроками этого матча; выводы по одному матчу ориентировочные</CardDescription>
        </div>
        <Select label="Игрок" value={focus ?? ''} onChange={onFocus} options={options} className="min-w-44" />
      </CardHeader>
      <CardContent>
        {!p ? (
          <EmptyState title="Выберите игрока" />
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-5">
              <Comparison p={p} others={data.players.filter((o) => o.steamid !== p.steamid)} />
              <div>
                <div className="mb-1 text-xs font-medium text-muted-foreground">Убийства по раундам</div>
                <div className="h-32">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={perRound} margin={{ top: 4, right: 4, bottom: 0, left: -28 }}>
                      <CartesianGrid {...gridProps} />
                      <XAxis dataKey="round" {...axisProps} />
                      <YAxis {...axisProps} allowDecimals={false} />
                      <Tooltip
                        cursor={{ fill: 'var(--card-2)' }}
                        content={({ active, payload }) => {
                          const d = active && payload?.[0]?.payload
                          return d ? <ChartTooltipBox title={`Раунд ${d.round}`} rows={[{ label: 'Убийства', value: d.kills }, { label: 'Итог', value: d.died ? 'погиб' : 'выжил' }]} /> : null
                        }}
                      />
                      <Bar dataKey="kills" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={20} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              {insights.length === 0 && <EmptyState title="Выраженных отличий от лобби нет" />}
              {insights.map((i, idx) => {
                const Icon = i.kind === 'strength' ? CirclePlus : i.kind === 'weakness' ? CircleMinus : Info
                return (
                  <div key={idx} className="flex gap-3 rounded-lg border p-3">
                    <Icon className={i.kind === 'strength' ? 'mt-0.5 size-4 shrink-0 text-good-text' : i.kind === 'weakness' ? 'mt-0.5 size-4 shrink-0 text-critical-text' : 'mt-0.5 size-4 shrink-0 text-muted-foreground'} />
                    <div>
                      <div className="text-sm font-medium">{i.title}</div>
                      <div className="text-xs text-muted-foreground">{i.detail}</div>
                    </div>
                  </div>
                )
              })}
              <div className="grid grid-cols-3 gap-2 pt-2 text-center text-xs">
                <div className="rounded-lg bg-card-2/60 p-2">
                  <div className="text-lg font-semibold">{p.clutch_wins}/{p.clutch_attempts}</div>
                  <div className="text-muted-foreground">клатчи</div>
                </div>
                <div className="rounded-lg bg-card-2/60 p-2">
                  <div className="text-lg font-semibold">{p.trade_kills}</div>
                  <div className="text-muted-foreground">трейд-киллы</div>
                </div>
                <div className="rounded-lg bg-card-2/60 p-2">
                  <div className="text-lg font-semibold">{p.utility_damage}</div>
                  <div className="text-muted-foreground">урон утилитой</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
