import { AlertTriangle, Loader2 } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'

import { useScoutJob, useStartScout } from '@/entities/scout'
import { Button, ErrorState, Progress } from '@/shared/ui'
import { Briefing, DuoNetwork, MapPool, PostMatch, PredictionPanel, ScoutHeader, Stability, TacticalMap, TeamBalance, ThreatCards } from '@/widgets/scout'

export function ScoutReportPage() {
  const { scoutId = '' } = useParams()
  const job = useScoutJob(scoutId)
  const restart = useStartScout()
  const navigate = useNavigate()

  if (job.isLoading) return <Loading progress={0} />
  if (job.error || !job.data) return <ErrorState error={job.error ?? 'Отчёт не найден'} />
  const d = job.data
  if (d.status === 'running') return <Loading progress={d.progress} />
  if (d.status === 'error')
    return (
      <ErrorState
        error={d.error ?? 'Ошибка разведки'}
        action={
          <Button size="sm" variant="secondary" onClick={() => restart.mutate({ url: d.match_id, refresh: true }, { onSuccess: (r) => navigate(`/scout/${r.id}`) })}>
            Повторить
          </Button>
        }
      />
    )
  const r = d.report!
  const refresh = () => restart.mutate({ url: r.match_id, refresh: true }, { onSuccess: (x) => navigate(`/scout/${x.id}`) })
  const missing = Object.values(r.teams).flatMap((t) => t.summary.players_missing_data)
  return (
    <div className="space-y-4">
      <ScoutHeader job={d} onRefresh={refresh} refreshing={restart.isPending} />
      {missing.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
          <AlertTriangle className="size-4" /> Неполные данные FACEIT по игрокам: {missing.join(', ')}. Выводы по ним ограничены.
        </div>
      )}
      <PostMatch r={r} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.25fr_1fr]">
        <Briefing job={d} />
        <div className="space-y-4">
          <TeamBalance r={r} />
          <PredictionPanel job={d} />
        </div>
      </div>
      <ThreatCards job={d} />
      <DuoNetwork r={r} />
      <TacticalMap r={r} />
      <MapPool r={r} />
      <Stability r={r} />
    </div>
  )
}

function Loading({ progress }: { progress: number }) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-4 rounded-2xl border bg-card p-10 text-center">
      <Loader2 className="size-7 animate-spin text-primary" />
      <div className="text-sm font-medium">Собираем разведданные по 10 игрокам…</div>
      <Progress value={Math.round(progress * 100)} className="w-full" />
      <div className="text-xs text-muted-foreground">
        Профили, lifetime-статистика, последние 30 матчей и история совместных игр каждого игрока. Запросы к FACEIT идут с ограничением частоты и кэшируются.
      </div>
    </div>
  )
}
