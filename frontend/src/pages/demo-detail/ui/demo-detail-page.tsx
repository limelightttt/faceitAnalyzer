import { ArrowLeft, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'

import { useDemo } from '@/entities/demo'
import { MapChip } from '@/entities/match'
import { clock } from '@/shared/lib/format'
import { Button, ErrorState, PageSkeleton, StatTile } from '@/shared/ui'
import { DemoPlayerInsights } from '@/widgets/demo-player-insights'
import { DemoScoreboard } from '@/widgets/demo-scoreboard'
import { HighlightsList } from '@/widgets/highlights-list'
import { RoundDetail } from '@/widgets/round-detail'
import { RoundTimeline } from '@/widgets/round-timeline'

export function DemoDetailPage() {
  const { demoId = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const { data, error, isLoading } = useDemo(demoId)
  const [focusState, setFocus] = useState<string | null>(null)
  const round = Number(params.get('round') ?? 1)
  const selectRound = (n: number) => {
    const next = new URLSearchParams(params)
    next.set('round', String(n))
    setParams(next, { replace: true })
    document.getElementById('round-detail')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  if (isLoading) return <PageSkeleton />
  if (error || !data) return <ErrorState error={error ?? 'Демо не найдено'} />
  const { meta, analysis } = data
  if (meta.status === 'error') return <ErrorState error={meta.error ?? 'Ошибка парсинга'} action={<Link to="/demos" className="text-xs underline">К списку демок</Link>} />
  if (!analysis)
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border bg-card p-12 text-center">
        <Loader2 className="size-6 animate-spin text-primary" />
        <div className="text-sm font-medium">Парсим демку «{meta.file_name}»…</div>
        <div className="text-xs text-muted-foreground">Обычно занимает 5–30 секунд в зависимости от размера файла. Страница обновится сама.</div>
      </div>
    )

  const focus = focusState ?? analysis.players.slice().sort((a, b) => b.rating - a.rating)[0]?.steamid ?? null
  const [a, b] = analysis.teams
  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" asChild>
        <Link to="/demos">
          <ArrowLeft /> Все демки
        </Link>
      </Button>
      <div className="flex flex-col gap-4 rounded-xl border bg-card p-5 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapChip map={analysis.map} /> · {analysis.rounds_played} раундов · {clock(analysis.duration_s)} · {analysis.parser}
          </div>
          <div className="mt-2 flex items-center gap-4 text-2xl font-semibold tracking-tight">
            <span className="flex items-center gap-2">
              <span className="inline-block size-3 rounded-full bg-series-1" /> {a.name}
            </span>
            <span className="tabular">
              {a.score} : {b.score}
            </span>
            <span className="flex items-center gap-2">
              {b.name} <span className="inline-block size-3 rounded-full bg-series-2" />
            </span>
          </div>
          <div className="mt-1 text-xs text-subtle-foreground">
            {meta.file_name}
            {meta.note ? ` · ${meta.note}` : ''}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <StatTile label="Хайлайты" value={analysis.highlights.length} className="p-3" />
          <StatTile label="Убийства" value={analysis.rounds.reduce((s, r) => s + r.kills.length, 0)} className="p-3" />
          <StatTile label="Ситуации 1vN" value={analysis.rounds.filter((r) => r.clutch).length} className="p-3" />
        </div>
      </div>
      <RoundTimeline data={analysis} selected={round} onSelect={selectRound} focus={focus} />
      <div id="round-detail">
        <RoundDetail data={analysis} round={round} onSelect={selectRound} focus={focus} />
      </div>
      <HighlightsList data={analysis} onRound={selectRound} focus={focus} />
      <DemoPlayerInsights data={analysis} focus={focus} onFocus={setFocus} />
      <DemoScoreboard data={analysis} focus={focus} onFocus={setFocus} />
      <details className="rounded-xl border bg-card p-4 text-xs text-muted-foreground">
        <summary className="cursor-pointer text-sm font-medium text-foreground">Определения метрик</summary>
        <ul className="mt-2 space-y-1">
          {Object.entries(analysis.definitions).map(([k, v]) => (
            <li key={k}>
              <b className="text-foreground uppercase">{k}</b>: {v}
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}
