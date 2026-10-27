import { NavLink, Outlet, useLocation, useParams } from 'react-router-dom'

import { useOverview } from '@/entities/player'
import { useSampleSize } from '@/features/sample-size'
import { cn } from '@/shared/lib/cn'
import { ErrorState, PageSkeleton } from '@/shared/ui'
import { Button } from '@/shared/ui'
import { RateLimitNote } from '@/pages/home/ui/home-page'
import { PlayerHeader } from '@/widgets/player-header'

const TABS = [
  { to: '', label: 'Обзор', end: true },
  { to: 'matches', label: 'Матчи' },
  { to: 'compare', label: 'Лучшие / худшие' },
  { to: 'insights', label: 'Сильные стороны' },
  { to: 'elo', label: 'Elo' },
  { to: 'matchmaking', label: 'Матчмейкинг' },
]

export function usePlayerParams() {
  const { nickname = '' } = useParams()
  const limit = useSampleSize()
  const { search } = useLocation()
  return { nickname, limit, search }
}

export function PlayerLayout() {
  const { nickname, limit, search } = usePlayerParams()
  const { data, error, isLoading, refetch } = useOverview(nickname, limit)
  if (isLoading)
    return (
      <div className="space-y-3">
        <div className="text-xs text-muted-foreground" role="status">
          Загружаем {limit} последних матчей {nickname} из FACEIT… Первый раз это до ~{Math.ceil((limit * 2) / 4)} с (по 2 запроса на матч с ограничением частоты), дальше — из кэша.
        </div>
        <PageSkeleton />
      </div>
    )
  if (error || !data)
    return (
      <div className="space-y-3">
        <RateLimitNote />
        <ErrorState
        error={error}
        action={
          <Button variant="secondary" size="sm" onClick={() => refetch()}>
            Повторить
          </Button>
        }
      />
      </div>
    )
  const base = `/players/${encodeURIComponent(nickname)}`
  return (
    <div className="space-y-4">
      <PlayerHeader profile={data.profile} quality={data.quality} />
      <nav className="-mx-1 flex gap-1 overflow-x-auto border-b px-1" aria-label="Разделы игрока">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            end={t.end}
            to={`${base}${t.to ? `/${t.to}` : ''}${search}`}
            className={({ isActive }) =>
              cn(
                '-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors',
                isActive ? 'border-primary font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
              )
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  )
}
