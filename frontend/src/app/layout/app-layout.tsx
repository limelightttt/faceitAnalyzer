import { Crosshair, FileVideo, GraduationCap, Home, LineChart, Radar, Settings } from 'lucide-react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'

import { useSession } from '@/entities/session'
import { PlayerSearch } from '@/features/player-search'
import { ThemeToggle } from '@/features/theme-toggle'
import { cn } from '@/shared/lib/cn'
import { Button } from '@/shared/ui'

const NAV = [
  { to: '/', label: 'Главная', icon: Home, end: true },
  { to: '/scout', label: 'Разведка', icon: Radar },
  { to: '/coach', label: 'Коуч', icon: GraduationCap },
  { to: '/predictions', label: 'Прогнозы', icon: LineChart },
  { to: '/demos', label: 'Демки', icon: FileVideo },
]

function Account() {
  const { data } = useSession()
  if (!data) return null
  if (!data.authenticated)
    return (
      <Button asChild size="sm" variant="secondary">
        <Link to="/settings">Войти</Link>
      </Button>
    )
  return (
    <Button asChild size="sm" variant="ghost">
      <Link to="/settings" aria-label="Аккаунт">
        <Settings /> <span className="hidden max-w-28 truncate lg:inline">{data.game_profile?.nickname ?? 'Аккаунт'}</span>
      </Link>
    </Button>
  )
}

export function AppLayout() {
  const { pathname } = useLocation()
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4">
          <Link to="/" className="flex shrink-0 items-center gap-2 font-semibold">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Crosshair className="size-4" />
            </span>
            <span className="hidden xl:inline">FACEIT Intelligence</span>
          </Link>
          <nav className="flex min-w-0 items-center gap-0.5 overflow-x-auto" aria-label="Основная навигация">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                aria-label={n.label}
                className={({ isActive }) =>
                  cn('flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors', isActive ? 'bg-card-2 text-foreground' : 'text-muted-foreground hover:text-foreground')
                }
              >
                <n.icon className="size-4" />
                <span className="hidden md:inline">{n.label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex min-w-0 items-center gap-1">
            {pathname !== '/' && <PlayerSearch className="hidden w-60 lg:flex" />}
            <Account />
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
      <footer className="mx-auto max-w-7xl px-4 pb-8 text-xs text-subtle-foreground">
        Не аффилировано с FACEIT или Valve. Прогнозы, оценки Elo, риск-сигналы и анализ матчмейкинга — исследовательские, не официальные и не обвинения.
      </footer>
    </div>
  )
}
