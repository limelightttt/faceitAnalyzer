import { Crosshair, FileVideo, Home } from 'lucide-react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'

import { PlayerSearch } from '@/features/player-search'
import { ThemeToggle } from '@/features/theme-toggle'
import { cn } from '@/shared/lib/cn'

const NAV = [
  { to: '/', label: 'Главная', icon: Home, end: true },
  { to: '/demos', label: 'Демки', icon: FileVideo },
]

export function AppLayout() {
  const { pathname } = useLocation()
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
          <Link to="/" className="flex shrink-0 items-center gap-2 font-semibold">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Crosshair className="size-4" />
            </span>
            <span className="hidden sm:inline">FACEIT Intelligence</span>
          </Link>
          <nav className="flex items-center gap-1" aria-label="Основная навигация">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors',
                    isActive ? 'bg-card-2 text-foreground' : 'text-muted-foreground hover:text-foreground',
                  )
                }
              >
                <n.icon className="size-4" />
                <span className="hidden sm:inline">{n.label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex min-w-0 items-center gap-2">
            {pathname !== '/' && <PlayerSearch className="hidden w-72 md:flex" />}
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
      <footer className="mx-auto max-w-7xl px-4 pb-8 text-xs text-subtle-foreground">
        Не аффилировано с FACEIT или Valve. Оценки Elo и анализ матчмейкинга — исследовательские, не официальные.
      </footer>
    </div>
  )
}
