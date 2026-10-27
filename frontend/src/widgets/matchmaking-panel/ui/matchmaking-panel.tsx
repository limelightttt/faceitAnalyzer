import { AlertTriangle, CheckCircle2, CircleHelp, Info, ShieldQuestion } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import type { Matchmaking, MMTest, TestStatus } from '@/entities/player'
import { cn } from '@/shared/lib/cn'
import { pct } from '@/shared/lib/format'
import { axisProps, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, ChartTooltipBox, gridProps, Legend } from '@/shared/ui'

const STATUS: Record<TestStatus, { label: string; variant: 'default' | 'good' | 'warn' | 'bad' | 'outline'; icon: typeof Info }> = {
  insufficient_data: { label: 'Мало данных', variant: 'outline', icon: CircleHelp },
  no_anomaly: { label: 'Аномалий нет', variant: 'good', icon: CheckCircle2 },
  weak_signal: { label: 'Слабый сигнал', variant: 'warn', icon: Info },
  anomaly: { label: 'Аномалия', variant: 'bad', icon: AlertTriangle },
}

function MiniChart({ t }: { t: MMTest }) {
  const c = t.chart
  if (!c) return null
  if (c.type === 'sequence') {
    return (
      <div className="flex flex-wrap gap-0.5" role="img" aria-label="Последовательность результатов">
        {c.sequence.map((r, i) => (
          <span key={i} className={cn('h-3 w-1.5 rounded-[1px]', r === 'W' ? 'bg-good' : 'bg-critical')} title={`#${i + 1}: ${r}`} />
        ))}
      </div>
    )
  }
  if (c.type === 'winrate') {
    return (
      <div className="space-y-2">
        {c.bars.map((b) => (
          <div key={b.label} className="grid grid-cols-[64px_1fr_92px] items-center gap-2 text-xs">
            <span className="truncate text-muted-foreground">{b.label}</span>
            <div className="relative h-4">
              <div className="absolute top-1/2 h-1.5 w-full -translate-y-1/2 rounded-full bg-card-2" />
              {b.ci && <div className="absolute top-1/2 h-px -translate-y-1/2 bg-series-1/60" style={{ left: `${b.ci[0] * 100}%`, width: `${(b.ci[1] - b.ci[0]) * 100}%` }} />}
              <div className="absolute top-0 h-4 w-px bg-subtle-foreground" style={{ left: '50%' }} />
              {b.expected != null && <div className="absolute top-0 h-4 w-0.5 bg-series-2" style={{ left: `${b.expected * 100}%` }} title={`Ожидание ${pct(b.expected)}`} />}
              <div className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-series-1" style={{ left: `${b.value * 100}%` }} />
            </div>
            <span className="text-right tabular">
              {pct(b.value)} <span className="text-subtle-foreground">n={b.n}</span>
            </span>
          </div>
        ))}
        {c.bars.some((b) => b.expected != null) && <Legend items={[{ label: 'Факт (95% CI)', color: 'var(--series-1)' }, { label: 'Ожидание по Elo', color: 'var(--series-2)' }]} />}
      </div>
    )
  }
  if (c.type === 'calibration') {
    return (
      <>
        <div className="h-36">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={c.bins} margin={{ top: 4, right: 4, bottom: 0, left: -24 }} barGap={2}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="bin" {...axisProps} />
              <YAxis {...axisProps} domain={[0, 1]} tickFormatter={(v) => `${Math.round(v * 100)}`} />
              <Tooltip
                cursor={{ fill: 'var(--card-2)' }}
                content={({ active, payload }) => {
                  const p = active && payload?.[0]?.payload
                  return p ? (
                    <ChartTooltipBox
                      title={`Вероятность ${p.bin}`}
                      rows={[
                        { label: 'Ожидание', value: pct(p.expected), color: 'var(--series-2)' },
                        { label: 'Факт', value: pct(p.observed), color: 'var(--series-1)' },
                        { label: 'Матчей', value: p.n },
                      ]}
                    />
                  ) : null
                }}
              />
              <Bar dataKey="expected" fill="var(--series-2)" radius={[4, 4, 0, 0]} maxBarSize={14} />
              <Bar dataKey="observed" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={14} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <Legend items={[{ label: 'Ожидаемая доля побед', color: 'var(--series-2)' }, { label: 'Фактическая', color: 'var(--series-1)' }]} />
      </>
    )
  }
  const data =
    c.type === 'bars'
      ? c.bars
      : (() => {
          const vals = c.values
          const min = Math.min(...vals)
          const max = Math.max(...vals)
          const bins = 12
          const w = (max - min) / bins || 1
          const counts = Array.from({ length: bins }, (_, i) => ({ label: (min + w * (i + 0.5)).toFixed(c.unit === 'Elo' ? 0 : 2), value: 0, n: 0 }))
          vals.forEach((v) => {
            const i = Math.min(bins - 1, Math.floor((v - min) / w))
            counts[i].value += 1
            counts[i].n += 1
          })
          return counts
        })()
  return (
    <div className="h-36">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" />
          <YAxis {...axisProps} />
          <ReferenceLine y={0} stroke="var(--axis)" />
          <Tooltip
            cursor={{ fill: 'var(--card-2)' }}
            content={({ active, payload }) => {
              const p = active && payload?.[0]?.payload
              return p ? (
                <ChartTooltipBox
                  title={c.type === 'bars' ? `${c.x_label}: ${p.label}` : `${p.label} ${c.unit ?? ''}`}
                  rows={c.type === 'bars' ? [{ label: c.y_label, value: p.value }, { label: 'Матчей', value: p.n }] : [{ label: 'Матчей', value: p.value }]}
                />
              ) : null
            }}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={24}>
            {data.map((_, i) => (
              <Cell key={i} fill="var(--series-1)" />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function TestCard({ t }: { t: MMTest }) {
  const s = STATUS[t.status]
  const Icon = s.icon
  return (
    <Card className={cn(t.status === 'anomaly' && 'border-critical/40')}>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle>{t.title}</CardTitle>
          <Badge variant={s.variant}>
            <Icon /> {s.label}
          </Badge>
        </div>
        <CardDescription>{t.question}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground tabular">
          <span>
            n = <b className="text-foreground">{t.n}</b> (мин. {t.min_n})
          </span>
          {t.p_value !== null && (
            <span>
              p = <b className="text-foreground">{t.p_value < 0.001 ? '<0.001' : t.p_value.toFixed(3)}</b>
            </span>
          )}
          {t.q_value !== null && (
            <span>
              q (BH) = <b className="text-foreground">{t.q_value < 0.001 ? '<0.001' : t.q_value.toFixed(3)}</b>
            </span>
          )}
        </div>
        {t.effect && <div className="text-sm">{t.effect}</div>}
        {t.status === 'weak_signal' && !t.practical && (
          <div className="text-xs text-muted-foreground">Статистически заметно, но размер эффекта практически ничтожен.</div>
        )}
        {t.status !== 'insufficient_data' && <MiniChart t={t} />}
        <details className="group text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none hover:text-foreground">Метод и альтернативные объяснения</summary>
          <p className="mt-2">{t.method}</p>
          <ul className="mt-2 list-disc space-y-0.5 pl-4">
            {t.alternatives.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </details>
      </CardContent>
    </Card>
  )
}

export function MatchmakingPanel({ data }: { data: Matchmaking }) {
  const v = data.verdict
  const tone = v.code === 'anomaly' ? 'border-critical/40 bg-critical/5' : v.code === 'no_evidence' ? 'border-good/30 bg-good/5' : 'border-warning/40 bg-warning/10'
  return (
    <div className="space-y-4">
      <div className={cn('rounded-xl border p-5', tone)}>
        <div className="flex items-start gap-3">
          <ShieldQuestion className="mt-0.5 size-5 shrink-0" />
          <div>
            <div className="text-sm font-semibold">
              Гипотеза «скрытого пула»:{' '}
              {v.code === 'anomaly' ? 'найдена аномалия (не доказательство)' : v.code === 'no_evidence' ? 'подтверждений в данных нет' : 'проверить нельзя'}
              {v.confidence !== 'none' && <span className="font-normal text-muted-foreground"> · доверие к выводу: {v.confidence === 'medium' ? 'среднее' : 'низкое'}</span>}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{v.text}</p>
            <p className="mt-2 text-xs text-subtle-foreground">
              Мы не утверждаем, что скрытый пул существует или не существует. Проверяются наблюдаемые следствия гипотезы, {data.tests.length} тестов
              на {data.matches} матчах, поправка Бенджамини–Хохберга (FDR {Math.round(data.fdr * 100)}%). Никакого «Hidden Pool Score» нет намеренно.
            </p>
          </div>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {data.tests.map((t) => (
          <TestCard key={t.id} t={t} />
        ))}
      </div>
    </div>
  )
}
