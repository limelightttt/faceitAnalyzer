import { ArrowLeft, ExternalLink } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import { MapChip, ResultPill } from '@/entities/match'
import { useBestWorst, useElo, useInsights, useMatchDetail, useMatchmaking, useOverview } from '@/entities/player'
import { dateTime, fmt } from '@/shared/lib/format'
import { Button, ErrorState, PageSkeleton, StatTile } from '@/shared/ui'
import { BestWorst } from '@/widgets/best-worst'
import { EloPanel } from '@/widgets/elo-panel'
import { InsightsPanel } from '@/widgets/insights-panel'
import { MapStats } from '@/widgets/map-stats'
import { MatchScoreboard } from '@/widgets/match-scoreboard'
import { MatchesTable } from '@/widgets/matches-table'
import { MatchmakingPanel } from '@/widgets/matchmaking-panel'
import { PlayerKpis } from '@/widgets/player-kpis'
import { RatingTrend } from '@/widgets/rating-trend'

import { usePlayerParams } from './player-layout'

function Guard<T>({ q, children }: { q: { data?: T; error: unknown; isLoading: boolean }; children: (d: T) => React.ReactNode }) {
  if (q.isLoading) return <PageSkeleton />
  if (q.error || !q.data) return <ErrorState error={q.error ?? 'Нет данных'} />
  return <>{children(q.data)}</>
}

export function PlayerOverviewPage() {
  const { nickname, limit, search } = usePlayerParams()
  const ov = useOverview(nickname, limit)
  const ins = useInsights(nickname, limit)
  return (
    <Guard q={ov}>
      {(d) => (
        <div className="space-y-4">
          <PlayerKpis data={d} />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.6fr_1fr]">
            <RatingTrend trend={d.trend} nickname={nickname} search={search} />
            <MapStats maps={d.maps} />
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.6fr_1fr]">
            <MatchesTable matches={d.matches} nickname={nickname} search={search} limit={8} title="Последние матчи" />
            {ins.data && <InsightsPanel data={ins.data} compact />}
          </div>
        </div>
      )}
    </Guard>
  )
}

export function PlayerMatchesPage() {
  const { nickname, limit, search } = usePlayerParams()
  return <Guard q={useOverview(nickname, limit)}>{(d) => <MatchesTable matches={d.matches} nickname={nickname} search={search} />}</Guard>
}

export function PlayerComparePage() {
  const { nickname, limit, search } = usePlayerParams()
  return <Guard q={useBestWorst(nickname, limit)}>{(d) => <BestWorst data={d} nickname={nickname} search={search} />}</Guard>
}

export function PlayerInsightsPage() {
  const { nickname, limit } = usePlayerParams()
  return <Guard q={useInsights(nickname, limit)}>{(d) => <InsightsPanel data={d} />}</Guard>
}

export function PlayerEloPage() {
  const { nickname, limit } = usePlayerParams()
  return <Guard q={useElo(nickname, limit)}>{(d) => <EloPanel data={d} />}</Guard>
}

export function PlayerMatchmakingPage() {
  const { nickname, limit } = usePlayerParams()
  return <Guard q={useMatchmaking(nickname, limit)}>{(d) => <MatchmakingPanel data={d} />}</Guard>
}

export function MatchDetailPage() {
  const { nickname, limit, search } = usePlayerParams()
  const { matchId = '' } = useParams()
  return (
    <Guard q={useMatchDetail(nickname, limit, matchId)}>
      {(d) => (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link to={`/players/${encodeURIComponent(nickname)}/matches${search}`}>
                <ArrowLeft /> К матчам
              </Link>
            </Button>
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
    </Guard>
  )
}
