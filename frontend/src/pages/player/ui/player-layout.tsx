import { NavLink, Outlet, useLocation } from 'react-router-dom'

import { useOverview } from '@/entities/player'
import { PlayerSearch } from '@/features/player-search'
import { cn } from '@/shared/lib/cn'
import { useDelayed } from '@/shared/lib/use-delayed'
import { AsyncView, LoadingSkeleton, Notice, Progress } from '@/shared/ui'
import { PlayerHeader } from '@/widgets/player-header'
import { RateLimitNote } from '@/widgets/system-status'

import { usePlayerParams } from '../model/params'
import { OverviewSkeleton, PlayerHeaderSkeleton } from './skeletons'

const TABS = [
  { to: '', label: 'Обзор', end: true },
  { to: 'matches', label: 'Матчи' },
  { to: 'compare', label: 'Лучшие / худшие' },
  { to: 'insights', label: 'Сильные стороны' },
  { to: 'elo', label: 'Elo' },
  { to: 'matchmaking', label: 'Матчмейкинг' },
]

/** First load of a player can take a while (FACEIT rate limit): say so honestly, with an indeterminate
 * bar — the server does not report progress for it. Appears only if the load is actually slow. */
function FirstLoadNote({ nickname, limit }: { nickname: string; limit: number }) {
  const slow = useDelayed(true, 1200)
  if (!slow) return null
  return (
    <div className="animate-enter space-y-2 rounded-lg border bg-card px-4 py-3" role="status">
      <div className="text-xs text-muted-foreground">
        Загружаем {limit} последних матчей <span className="font-medium text-foreground">{nickname}</span> из FACEIT. Первый раз это до ~{Math.ceil((limit * 2) / 4)} с (по 2 запроса на матч с ограничением частоты), дальше — из кэша.
      </div>
      <Progress value={null} className="h-1" label="Загрузка матчей" />
    </div>
  )
}

function PlayerTabs({ base, search }: { base: string; search: string }) {
  return (
    <nav className="-mx-1 flex gap-1 overflow-x-auto border-b px-1" aria-label="Разделы игрока">
      {TABS.map((t) => (
        <NavLink
          key={t.to}
          end={t.end}
          to={`${base}${t.to ? `/${t.to}` : ''}${search}`}
          className={({ isActive }) =>
            cn(
              '-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors duration-[var(--dur-fast)] focus-visible:rounded-t-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
              isActive ? 'border-primary font-medium text-foreground' : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
            )
          }
        >
          {t.label}
        </NavLink>
      ))}
    </nav>
  )
}

export function PlayerLayout() {
  const { nickname, limit, search } = usePlayerParams()
  const overview = useOverview(nickname, limit)
  const { pathname } = useLocation()
  const base = `/players/${encodeURIComponent(nickname)}`
  return (
    <div className="space-y-4">
      <RateLimitNote />
      <AsyncView
        query={overview}
        notFound={`Игрок «${nickname}» не найден на FACEIT`}
        action={<PlayerSearch className="w-full max-w-sm" />}
        skeleton={
          <div className="space-y-4">
            <FirstLoadNote nickname={nickname} limit={limit} />
            <LoadingSkeleton label={`Загружаем профиль ${nickname}`} className="space-y-4">
              <PlayerHeaderSkeleton />
              <PlayerTabs base={base} search={search} />
              <OverviewSkeleton />
            </LoadingSkeleton>
          </div>
        }
      >
        {(data) => (
          <div className="space-y-4">
            <PlayerHeader profile={data.profile} quality={data.quality} />
            {overview.isFetching && !overview.isPending && <RefreshHint />}
            <PlayerTabs base={base} search={search} />
            {/* sub-tab content swaps with a short fade, the header stays put */}
            <div key={pathname} className="animate-fade-in">
              <Outlet />
            </div>
          </div>
        )}
      </AsyncView>
    </div>
  )
}

/** Background refresh (e.g. a new sample size) never blanks the page; a quiet hint says it is updating. */
function RefreshHint() {
  const show = useDelayed(true, 400)
  if (!show) return null
  return (
    <Notice tone="info" className="py-1.5">
      Обновляем данные… Пока показаны прежние значения.
    </Notice>
  )
}
