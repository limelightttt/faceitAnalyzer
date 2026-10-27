import { Star } from 'lucide-react'
import { useState } from 'react'

import type { DemoAnalysis } from '@/entities/demo'
import { cn } from '@/shared/lib/cn'
import { clock } from '@/shared/lib/format'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CopyButton, EmptyState, Select } from '@/shared/ui'

export function HighlightsList({ data, onRound, focus }: { data: DemoAnalysis; onRound: (n: number) => void; focus: string | null }) {
  const [who, setWho] = useState<string>('all')
  const effective = who === 'focus' ? focus : who === 'all' ? null : who
  const items = data.highlights.filter((h) => !effective || h.steamid === effective)
  const players = [...new Set(data.highlights.map((h) => h.steamid))]
  const names = Object.fromEntries(data.players.map((p) => [p.steamid, p.name]))
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>Хайлайты</CardTitle>
          <CardDescription>
            Кандидаты на клип: рейтинг момента 0–100 (мультикилл, клатч, скорость, особые убийства). Команда <code className="font-mono">demo_gototick</code> переносит в нужный момент демки в CS2 (за 5 с до первого убийства).
          </CardDescription>
        </div>
        <Select
          label="Игрок"
          value={who}
          onChange={setWho}
          options={[
            { value: 'all', label: 'Все игроки' },
            ...(focus ? [{ value: 'focus', label: 'Фокус-игрок' }] : []),
            ...players.map((p) => ({ value: p, label: names[p] ?? p })),
          ]}
        />
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <EmptyState title="Хайлайтов не найдено">Порог — 30 баллов (например, трипл или выигранный клатч).</EmptyState>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {items.map((h) => (
              <div
                key={h.id}
                role="button"
                tabIndex={0}
                onClick={() => onRound(h.round)}
                onKeyDown={(e) => e.key === 'Enter' && onRound(h.round)}
                className="cursor-pointer rounded-lg border p-3 transition-colors hover:bg-card-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <span className="inline-block size-2 shrink-0 rounded-full" style={{ background: h.team === 'A' ? 'var(--series-1)' : 'var(--series-2)' }} />
                      <span className="truncate">
                        {h.title} — {h.player}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Раунд {h.round} · {clock(h.round_time)} от начала раунда · {h.round_won ? 'раунд выигран' : 'раунд проигран'}
                    </div>
                    <div className="mt-1 truncate text-xs text-subtle-foreground">
                      {h.weapons.join(', ')} → {h.victims.join(', ')}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className={cn('flex items-center gap-1 text-sm font-semibold tabular', h.score >= 60 && 'text-primary')}>
                      <Star className="size-3.5 fill-warning text-warning" />
                      {h.score}
                    </span>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1">
                    {h.tags.map((t) => (
                      <span key={t} className="rounded bg-card-2 px-1.5 py-0.5 text-[11px] text-muted-foreground">
                        {t}
                      </span>
                    ))}
                  </div>
                  <CopyButton text={h.goto_cmd} />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
