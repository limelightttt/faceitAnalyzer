import { CircleMinus, CirclePlus, CircleSlash, HelpCircle } from 'lucide-react'

import type { InsightItem, Insights } from '@/entities/player'
import { cn } from '@/shared/lib/cn'
import { fmt, pct } from '@/shared/lib/format'
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Hint } from '@/shared/ui'

const STATUS = {
  strength: { label: 'Сильная сторона', icon: CirclePlus, cls: 'text-good-text', variant: 'good' as const },
  weakness: { label: 'Зона роста', icon: CircleMinus, cls: 'text-critical-text', variant: 'bad' as const },
  neutral: { label: 'В норме лобби', icon: CircleSlash, cls: 'text-muted-foreground', variant: 'default' as const },
  insufficient_data: { label: 'Мало данных', icon: HelpCircle, cls: 'text-subtle-foreground', variant: 'outline' as const },
}

const isRate = (i: InsightItem) => i.kind === 'pooled' || i.key === 'survival'
const show = (i: InsightItem, v: number | null | undefined) => (isRate(i) ? pct(v, 0) : fmt(v, i.key === 'adr' || i.key === 'hs' ? 1 : 2))

/** Diverging interval bar: paired difference vs lobby with its CI, zero in the middle. */
function DiffBar({ item }: { item: InsightItem }) {
  if (!item.ci || item.diff === undefined) return null
  const scale = Math.max(Math.abs(item.ci[0]), Math.abs(item.ci[1]), Math.abs(item.diff)) * 1.15 || 1
  const x = (v: number) => 50 + (v / scale) * 50
  const color = item.status === 'strength' ? 'var(--good)' : item.status === 'weakness' ? 'var(--critical)' : 'var(--subtle-foreground)'
  return (
    <div className="relative h-4 w-full" aria-hidden>
      <div className="absolute top-1/2 h-px w-full bg-[var(--grid)]" />
      <div className="absolute top-0 h-4 w-px bg-[var(--axis)]" style={{ left: '50%' }} />
      <div className="absolute top-1/2 h-0.5 -translate-y-1/2 rounded" style={{ left: `${x(item.ci[0])}%`, width: `${x(item.ci[1]) - x(item.ci[0])}%`, background: color, opacity: 0.6 }} />
      <div className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card" style={{ left: `${x(item.diff)}%`, background: color }} />
    </div>
  )
}

function Row({ item }: { item: InsightItem }) {
  const s = STATUS[item.status]
  const Icon = s.icon
  return (
    <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] items-center gap-3 py-2.5">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <Icon className={cn('size-4 shrink-0', s.cls)} aria-label={s.label} />
          <span className="truncate">{item.label}</span>
        </div>
        <div className="mt-0.5 truncate pl-5.5 text-xs text-muted-foreground">{item.description}</div>
      </div>
      <Hint
        content={
          item.status === 'insufficient_data'
            ? `Недостаточно данных: n = ${item.n}`
            : `Разница с лобби ${fmt(item.diff, 3)} (95% CI ${fmt(item.ci?.[0], 3)}…${fmt(item.ci?.[1], 3)})${item.effect_size !== undefined ? `, эффект ${fmt(item.effect_size)} SD` : ''}${item.percentile !== undefined ? `, выше ${item.percentile}% значений лобби` : ''}. n = ${item.n}`
        }
      >
        <div className="py-1">{item.status === 'insufficient_data' ? <span className="text-xs text-subtle-foreground">n = {item.n}</span> : <DiffBar item={item} />}</div>
      </Hint>
      <div className="w-32 text-right text-xs tabular">
        <span className="font-semibold text-foreground">{show(item, item.player)}</span>
        <span className="text-subtle-foreground"> vs {show(item, item.lobby)}</span>
        <div className="text-[10px] text-subtle-foreground">доверие: {item.confidence === 'high' ? 'высокое' : item.confidence === 'medium' ? 'среднее' : 'низкое'}</div>
      </div>
    </div>
  )
}

export function InsightsPanel({ data, compact = false }: { data: Insights; compact?: boolean }) {
  const order = { strength: 0, weakness: 1, neutral: 2, insufficient_data: 3 }
  const items = [...data.items].sort((a, b) => order[a.status] - order[b.status])
  const shown = compact ? items.filter((i) => i.status === 'strength' || i.status === 'weakness').slice(0, 6) : items
  return (
    <Card>
      <CardHeader>
        <CardTitle>Сильные стороны и зоны роста</CardTitle>
        <CardDescription>
          Относительно других 9 игроков тех же матчей · точка — средняя разница, линия — 95% интервал, вертикаль — уровень лобби
        </CardDescription>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {data.strengths.map((s) => (
            <Badge key={s} variant="good">
              <CirclePlus /> {s}
            </Badge>
          ))}
          {data.weaknesses.map((s) => (
            <Badge key={s} variant="bad">
              <CircleMinus /> {s}
            </Badge>
          ))}
          {data.strengths.length + data.weaknesses.length === 0 && (
            <span className="text-xs text-muted-foreground">Статистически выраженных отличий от лобби не найдено.</span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="divide-y">
          {shown.map((i) => (
            <Row key={i.key} item={i} />
          ))}
        </div>
        {!compact && <p className="mt-3 text-xs leading-relaxed text-subtle-foreground">Методика: {data.method}</p>}
      </CardContent>
    </Card>
  )
}
