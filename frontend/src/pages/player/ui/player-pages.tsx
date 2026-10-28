import { ArrowLeft, ExternalLink } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'

import { MapChip, ResultPill } from '@/entities/match'
import { useBestWorst, useElo, useInsights, useMatchDetail, useMatchmaking, useOverview } from '@/entities/player'
import { dateTime, fmt } from '@/shared/lib/format'
import { AsyncView, Button, LoadingSkeleton, type QueryState, StatTile } from '@/shared/ui'
import { BestWorst } from '@/widgets/best-worst'
import { EloPanel } from '@/widgets/elo-panel'
import { InsightsPanel } from '@/widgets/insights-panel'
import { MapStats } from '@/widgets/map-stats'
import { MatchScoreboard } from '@/widgets/match-scoreboard'
import { MatchesTable } from '@/widgets/matches-table'
import { MatchmakingPanel } from '@/widgets/matchmaking-panel'
import { PlayerKpis } from '@/widgets/player-kpis'
import { RatingTrend } from '@/widgets/rating-trend'

import { usePlayerParams } from '../model/params'
import { ChartsSkeleton, MatchSkeleton, OverviewSkeleton, TableSkeleton, TwoCardsSkeleton } from './skeletons'

/** A player tab: its own query, its own content-shaped skeleton. */
function Tab<T>({ q, skeleton, label, notFound, children }: { q: QueryState<T>; skeleton: ReactNode; label: string; notFound?: string; children: (d: T) => ReactNode }) {
  return (
    <AsyncView query={q} notFound={notFound} skeleton={<LoadingSkeleton label={label}>{skeleton}</LoadingSkeleton>}>
      {children}
    </AsyncView>
  )
}

export function PlayerOverviewPage() {
  const { nickname, limit, search } = usePlayerParams()
  const ov = useOverview(nickname, limit)
  const ins = useInsights(nickname, limit)
  return (
    <Tab q={ov} label="Загружаем обзор" skeleton={<OverviewSkeleton />}>
      {(d) => (
        <div className="space-y-4">
          <PlayerKpis data={d} />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.6fr_1fr]">
            <RatingTrend trend={d.trend} nickname={nickname} search={search} />
            <MapStats maps={d.maps} />
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.6fr_1fr]">
            <MatchesTable matches={d.matches} nickname={nickname} search={search} limit={8} title="Последние матчи" />
            {/* secondary panel: loads on its own and never blocks the overview */}
            {ins.data ? <InsightsPanel data={ins.data} compact /> : ins.isPending ? <TwoCardsSkeleton /> : null}
          </div>
        </div>
      )}
    </Tab>
  )
}

export function PlayerMatchesPage() {
  const { nickname, limit, search } = usePlayerParams()
  return (
    <Tab q={useOverview(nickname, limit)} label="Загружаем матчи" skeleton={<TableSkeleton />}>
      {(d) => <MatchesTable matches={d.matches} nickname={nickname} search={search} />}
    </Tab>
  )
}

export function PlayerComparePage() {
  const { nickname, limit, search } = usePlayerParams()
  return (
    <Tab q={useBestWorst(nickname, limit)} label="Сравниваем лучшие и худшие матчи" skeleton={<TwoCardsSkeleton />}>
      {(d) => <BestWorst data={d} nickname={nickname} search={search} />}
    </Tab>
  )
}

export function PlayerInsightsPage() {
  const { nickname, limit } = usePlayerParams()
  return (
    <Tab q={useInsights(nickname, limit)} label="Ищем сильные и слабые стороны" skeleton={<TwoCardsSkeleton />}>
      {(d) => <InsightsPanel data={d} />}
    </Tab>
  )
}

export function PlayerEloPage() {
  const { nickname, limit } = usePlayerParams()
  return (
    <Tab q={useElo(nickname, limit)} label="Загружаем историю Elo" skeleton={<ChartsSkeleton />}>
      {(d) => <EloPanel data={d} />}
    </Tab>
  )
}

export function PlayerMatchmakingPage() {
  const { nickname, limit } = usePlayerParams()
  return (
    <Tab q={useMatchmaking(nickname, limit)} label="Анализируем матчмейкинг" skeleton={<ChartsSkeleton />}>
      {(d) => <MatchmakingPanel data={d} />}
    </Tab>
  )
}

export function MatchDetailPage() {
  const { nickname, limit, search } = usePlayerParams()
  const { matchId = '' } = useParams()
  const back = (
    <Button variant="ghost" size="sm" asChild>
      <Link to={`/players/${encodeURIComponent(nickname)}/matches${search}`}>
        <ArrowLeft /> К матчам
      </Link>
    </Button>
  )
  return (
    <Tab q={useMatchDetail(nickname, limit, matchId)} label="Загружаем матч" notFound="Матч не найден в выборке игрока" skeleton={<MatchSkeleton />}>
      {(d) => (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {back}
            <div className="flex items-center gap-3 text-sm">
              <ResultPill won={d.row.won} />
              <MapChip map={d.match.map} />
              <span className="text-muted-foreground">{dateTime(d.match.started_at)}</span>
              {d.match.faceit_url && (
                <a href={d.match.faceit_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
                  Комната FACEIT <ExternalLink className="size-3" />
                </a>
              )}
            </div>
          </div>
          {d.row.has_stats && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <StatTile label="Rating 1.0" value={fmt(d.row.rating)} />
              <StatTile label="K / D / A" value={`${d.row.kills}/${d.row.deaths}/${d.row.assists}`} />
              <StatTile label="ADR" value={fmt(d.row.adr, 1)} />
              <StatTile label="Entry" value={d.row.entry_count != null ? `${d.row.entry_wins}/${d.row.entry_count}` : '—'} hint="выиграно / попыток" />
              <StatTile label="Клатчи 1v1 / 1v2" value={`${d.row.clutch_1v1?.[0] ?? 0}/${d.row.clutch_1v1?.[1] ?? 0} · ${d.row.clutch_1v2?.[0] ?? 0}/${d.row.clutch_1v2?.[1] ?? 0}`} />
            </div>
          )}
          <MatchScoreboard detail={d} />
          <p className="text-xs text-subtle-foreground">
            Для поминутного разбора (раунды, трейды, хайлайты) скачайте демо этого матча на FACEIT и загрузите его в разделе{' '}
            <Link to="/demos" className="underline">
              Демки
            </Link>
            .
          </p>
        </div>
      )}
    </Tab>
  )
}
