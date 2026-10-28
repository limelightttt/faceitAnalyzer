import { AlertTriangle, ArrowLeft, RotateCcw } from 'lucide-react'
import { type CSSProperties, useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'

import { type ScoutJob, useScoutJob } from '@/entities/scout'
import { useLaunchScout } from '@/features/omni-search'
import { isConnectivityError } from '@/shared/api/errors'
import { mapName } from '@/shared/lib/format'
import { notify } from '@/shared/lib/notify'
import { Button, ErrorState, JobProgress, type JobStep, LoadingSkeleton, Notice, Skeleton } from '@/shared/ui'
import { Briefing, DuoNetwork, PostMatch, PredictionPanel, ScoutHeader, ScoutSummary, Stability, TacticalMap, TeamBalance, ThreatCards } from '@/widgets/scout'

import { useMapPickWatch } from '../model/use-map-pick-watch'
import { MapsSection } from './maps-section'
import { ReportSection } from './report-section'
import { type SectionLink, SectionNav } from './section-nav'

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

const SECTIONS: SectionLink[] = [
  { id: 'summary', label: 'Сводка' },
  { id: 'briefing', label: 'Брифинг' },
  { id: 'threats', label: 'Угрозы' },
  { id: 'duos', label: 'Связки' },
  { id: 'maps', label: 'Карты' },
  { id: 'tactical', label: 'Тактика' },
  { id: 'stability', label: 'Стабильность' },
]

export function ScoutReportPage() {
  const { scoutId = '' } = useParams()
  const job = useScoutJob(scoutId)
  const { launch, start } = useLaunchScout()
  const rerun = (matchId: string) => launch(matchId, { refresh: true })
  const onMapPicked = useCallback(
    (map: string) => {
      notify.info(`Карта выбрана: ${mapName(map)}`, { description: 'Обновляем отчёт с учётом карты…' })
      if (job.data) launch(job.data.match_id, { refresh: true })
    },
    [job.data, launch],
  )
  const waitingForMap = useMapPickWatch(job.data, onMapPicked)

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
          <Button size="sm" variant="secondary" onClick={() => rerun(d.match_id)} loading={start.isPending}>
            <RotateCcw /> Запустить заново
          </Button>
        }
      />
    )
  const r = d.report!
  const missing = Object.values(r.teams).flatMap((t) => t.summary.players_missing_data)
  const calm = Object.values(r.teams).every((t) => t.instability.signals.length === 0)
  const sections = [
    <ReportSection key="summary" id="summary" title="Сводка">
      <div className="space-y-4">
        <ScoutSummary r={r} waitingForMap={waitingForMap} />
        <PostMatch r={r} />
      </div>
    </ReportSection>,
    <ReportSection key="briefing" id="briefing" title="Брифинг">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.25fr_1fr]">
        <Briefing job={d} />
        <div className="space-y-4">
          <TeamBalance r={r} />
          <PredictionPanel job={d} />
        </div>
      </div>
    </ReportSection>,
    <ReportSection key="threats" id="threats" title="Угрозы">
      <ThreatCards job={d} />
    </ReportSection>,
    <ReportSection key="duos" id="duos" title="Связки">
      <DuoNetwork r={r} />
    </ReportSection>,
    <ReportSection key="maps" id="maps" title="Карты">
      <MapsSection r={r} />
    </ReportSection>,
    <ReportSection
      key="tactical"
      id="tactical"
      title="Тактика"
      folded={r.tactical_coverage.players_with_demos === 0 ? 'нет разобранных демок этих игроков — позиции появятся, когда вы загрузите их демки' : undefined}
    >
      <TacticalMap r={r} />
    </ReportSection>,
    <ReportSection key="stability" id="stability" title="Стабильность" folded={calm ? 'признаков нестабильности составов в статистике нет' : undefined}>
      <Stability r={r} />
    </ReportSection>,
  ]
  return (
    <div className="space-y-4">
      <ScoutHeader job={d} onRefresh={() => rerun(r.match_id)} refreshing={start.isPending} />
      {missing.length > 0 && (
        <Notice tone="warning" icon={AlertTriangle}>
          Неполные данные FACEIT по игрокам: {missing.join(', ')}. Выводы по ним ограничены.
        </Notice>
      )}
      <SectionNav sections={SECTIONS} />
      {/* sections enter with a short stagger: the eye follows the order of the report */}
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
