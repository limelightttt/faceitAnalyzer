import type { MapStat } from '@/entities/player'
import { MapChip } from '@/entities/match'
import { fmt, pct } from '@/shared/lib/format'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Hint } from '@/shared/ui'

/** Win rate with its 95% Wilson interval drawn as a whisker on a 0-100% track. */
function WinRateBar({ m }: { m: MapStat }) {
  if (m.win_rate === null) return <span className="text-xs text-subtle-foreground">—</span>
  const [lo, hi] = m.win_rate_ci
  return (
    <Hint content={`Win rate ${pct(m.win_rate)} · 95% CI ${pct(lo)}–${pct(hi)} · ${m.wins} из ${m.matches}`}>
      <div className="relative h-5 w-full min-w-28" role="img" aria-label={`Win rate ${pct(m.win_rate)}`}>
        <div className="absolute top-1/2 h-1.5 w-full -translate-y-1/2 rounded-full bg-card-2" />
        <div className="absolute top-1/2 h-px -translate-y-1/2 bg-series-1/50" style={{ left: `${lo * 100}%`, width: `${(hi - lo) * 100}%` }} />
        <div className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-subtle-foreground" style={{ left: '50%' }} />
        <div
          className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-series-1"
          style={{ left: `${m.win_rate * 100}%` }}
        />
      </div>
    </Hint>
  )
}

export function MapStats({ maps }: { maps: MapStat[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Карты</CardTitle>
        <CardDescription>Win rate с 95% интервалом (линия) — на малых выборках интервал широкий; вертикаль — 50%</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {maps.map((m) => (
          <div key={m.map} className="grid grid-cols-[96px_1fr_auto] items-center gap-3 text-sm">
            <MapChip map={m.map} />
            <WinRateBar m={m} />
            <div className="w-36 text-right text-xs text-muted-foreground tabular">
              <span className="font-medium text-foreground">{pct(m.win_rate)}</span> · {m.matches} м · R {fmt(m.rating)}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
