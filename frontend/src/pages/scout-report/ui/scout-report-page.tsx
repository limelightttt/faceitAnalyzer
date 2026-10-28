import { AlertTriangle, ArrowLeft, RotateCcw } from 'lucide-react'
import type { CSSProperties } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { type ScoutJob, useScoutJob, useStartScout } from '@/entities/scout'
import { trackJob } from '@/features/job-tracking'
import { isConnectivityError } from '@/shared/api/errors'
import { Button, ErrorState, JobProgress, type JobStep, LoadingSkeleton, Notice, Skeleton } from '@/shared/ui'
import { Briefing, DuoNetwork, MapPool, PostMatch, PredictionPanel, ScoutHeader, Stability, TacticalMap, TeamBalance, ThreatCards } from '@/widgets/scout'

const PLAYERS_START = 0.1 // server milestones (backend scout/service.py)
const BRIEFING_START = 0.9

/** Steps exactly as the server reports them; the bar is the server's own progress value. */
function scoutSteps(job: ScoutJob): JobStep[] {
  const p = job.progress
  const stage = job.stage ?? (p < PLAYERS_START ? 'match' : p < BRIEFING_START ? 'players' : 'briefing')
  const order = ['match', 'players', 'briefing'] as const
  const at = order.indexOf(stage as (typeof order)[number])
  const state = (i: number): JobStep['state'] => (at > i ? 'done' : at === i ? 'active' : 'pending')
  const playersPct = Math.round(Math.max(0, Math.min(1, (p - PLAYERS_START) / (BRIEFING_START - PLAYERS_START))) * 100)
  return [
    { key: 'match', label: 'Матч и составы команд', state: state(0) },
    { key: 'players', label: 'Профили, статистика и история 10 игроков', state: state(1), detail: at === 1 ? `собрано ${playersPct}%` : undefined },
    { key: 'briefing', label: 'Связки, риск-профили, тактика и брифинг', state: state(2) },
  ]
}

export function ScoutReportPage() {
  const { scoutId = '' } = useParams()
  const job = useScoutJob(scoutId)
  const restart = useStartScout()
  const navigate = useNavigate()
  const rerun = (matchId: string) =>
    restart.mutate(
      { url: matchId, refresh: true },
      {
        onSuccess: (r) => {
          trackJob({ kind: 'scout', id: r.id, label: `Матч ${r.match_id.slice(0, 13)}…` })
          navigate(`/scout/${r.id}`)
        },
      },
    )

  const d = job.data
  if (!d) {
    if (job.error)
      return (
        <ErrorState
          error={job.error}
          notFound="Отчёт разведки не найден"
          onRetry={() => job.refetch()}
          action={
            <Button asChild size="sm" variant="ghost">
              <Link to="/scout">
                <ArrowLeft /> К разведке
              </Link>
            </Button>
          }
        />
      )
    return (
      <LoadingSkeleton label="Открываем отчёт разведки">
        <ReportSkeleton />
      </LoadingSkeleton>
    )
  }
  // polling failed while we already show the job: keep it on screen, explain, recover automatically
  const lost = job.error && isConnectivityError(job.error)

  if (d.status === 'running')
    return (
      <div className="space-y-3">
        {lost && <Notice tone="warning">Связь с сервером прервалась. Разведка продолжается на сервере — статус обновится, когда связь вернётся.</Notice>}
        <JobProgress
          title="Собираем разведданные по 10 игрокам"
          steps={scoutSteps(d)}
          value={Math.round(d.progress * 100)}
          note="Запросы к FACEIT идут с ограничением частоты и кэшируются. Можно уйти со страницы: разведка продолжится, а когда будет готова — появится уведомление."
        />
      </div>
    )
  if (d.status === 'error')
    return (
      <ErrorState
        error={d.error ?? 'Ошибка разведки'}
        action={
          <Button size="sm" variant="secondary" onClick={() => rerun(d.match_id)} loading={restart.isPending}>
            <RotateCcw /> Запустить заново
          </Button>
        }
      />
    )
  const r = d.report!
  const missing = Object.values(r.teams).flatMap((t) => t.summary.players_missing_data)
  // the report renders section by section with a short stagger: the eye follows the order of the briefing
  const sections = [
    <PostMatch key="post" r={r} />,
    <div key="main" className="grid grid-cols-1 gap-4 xl:grid-cols-[1.25fr_1fr]">
      <Briefing job={d} />
      <div className="space-y-4">
        <TeamBalance r={r} />
        <PredictionPanel job={d} />
      </div>
    </div>,
    <ThreatCards key="threats" job={d} />,
    <DuoNetwork key="duos" r={r} />,
    <TacticalMap key="tactical" r={r} />,
    <MapPool key="maps" r={r} />,
    <Stability key="stability" r={r} />,
  ]
  return (
    <div className="space-y-4">
      <ScoutHeader job={d} onRefresh={() => rerun(r.match_id)} refreshing={restart.isPending} />
      {missing.length > 0 && (
        <Notice tone="warning" icon={AlertTriangle}>
          Неполные данные FACEIT по игрокам: {missing.join(', ')}. Выводы по ним ограничены.
        </Notice>
      )}
      {sections.map((s, i) => (
        <div key={s.key} className="animate-enter" style={{ '--i': i } as CSSProperties}>
          {s}
        </div>
      ))}
    </div>
  )
}

function ReportSkeleton() {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-card p-5">
        <Skeleton className="h-5 w-40 rounded-md" />
        <Skeleton className="mt-3 h-7 w-80 max-w-full" />
        <Skeleton className="mt-2 h-3 w-96 max-w-full" />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.25fr_1fr]">
        <Skeleton className="h-96 rounded-xl" />
        <div className="space-y-4">
          <Skeleton className="h-52 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      </div>
    </div>
  )
}
