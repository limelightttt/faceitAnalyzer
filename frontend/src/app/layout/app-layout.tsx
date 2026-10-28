import { FileVideo, GraduationCap, Home, Layers, LineChart, Radar, Settings, UserRound } from 'lucide-react'
import { useCallback, useEffect, useRef } from 'react'
import { Link, NavLink, Outlet, ScrollRestoration, useLocation, useNavigate, useNavigation } from 'react-router-dom'

import { useSession, useSessionExpired } from '@/entities/session'
import { useHealth } from '@/entities/system'
import { finishLogin, usePendingLogin } from '@/features/auth'
import { CommandPalette, type PaletteLink } from '@/features/command-palette'
import { JobWatcher } from '@/features/job-tracking'
import { PasteToScout } from '@/features/omni-search'
import { ThemeToggle } from '@/features/theme-toggle'
import { type AuthPhase, AuthScreen } from '@/pages/login'
import { cn } from '@/shared/lib/cn'
import { useDelayed } from '@/shared/lib/use-delayed'
import { BrandMark, Button, ErrorState, Spinner } from '@/shared/ui'
import { ConnectionBanner } from '@/widgets/system-status'

/** Main navigation (also offered by the Ctrl+K palette). "Профиль" appears once the FACEIT profile is known. */
function useNavLinks(): (PaletteLink & { end?: boolean })[] {
  const { data } = useSession()
  const me = data?.game_profile?.nickname
  return [
    { to: '/', label: 'Главная', icon: Home, end: true },
    ...(me ? [{ to: `/players/${encodeURIComponent(me)}`, label: 'Профиль', icon: UserRound }] : []),
    { to: '/scout', label: 'Разведка', icon: Radar },
    { to: '/stack', label: 'Стак', icon: Layers },
    { to: '/coach', label: 'Коуч', icon: GraduationCap },
    { to: '/predictions', label: 'Прогнозы', icon: LineChart },
    { to: '/demos', label: 'Демки', icon: FileVideo },
  ]
}

function Account() {
  const { data } = useSession()
  const health = useHealth()
  if (!data) return null
  // with a mandatory sign-in the page itself is the sign-in card: no second "Войти" in the header
  if (!data.authenticated && health.data?.require_login !== false) return null
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

/** First paint while the session is checked: nothing for fast servers, a calm brand splash otherwise. */
function BootSplash() {
  const show = useDelayed(true, 250)
  return (
    <div className="flex min-h-[60dvh] items-center justify-center" role="status" aria-label="Загрузка приложения">
      {show && (
        <div className="animate-fade-in flex flex-col items-center gap-4 text-muted-foreground">
          <BrandMark size="lg" />
          <Spinner className="size-5 text-primary" />
        </div>
      )}
    </div>
  )
}

/** Thin bar under the header while the next page's code loads (only if it takes noticeable time). */
function RouteProgress() {
  const busy = useDelayed(useNavigation().state !== 'idle', 200)
  if (!busy) return null
  return (
    <div className="absolute inset-x-0 -bottom-px h-0.5 overflow-hidden" role="progressbar" aria-label="Загрузка страницы">
      <div className="motion-essential h-full w-full origin-left bg-primary" style={{ animation: 'fi-indeterminate 1.1s var(--ease-morph) infinite' }} />
    </div>
  )
}

/** Route content enters with the shared rise; sub-tabs of a player keep their header steady. */
function RouteTransition() {
  const { pathname } = useLocation()
  const key = pathname.startsWith('/players/') ? pathname.split('/').slice(0, 3).join('/') : pathname
  // after an in-app navigation, keyboard and screen-reader focus starts at the new page, not the old link
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    document.getElementById('main')?.focus({ preventScroll: true })
  }, [key])
  return (
    <div key={key} className="animate-enter">
      <Outlet />
    </div>
  )
}

const withoutAuthError = (search: string) => {
  const p = new URLSearchParams(search)
  p.delete('auth_error')
  const s = p.toString()
  return s ? `?${s}` : ''
}

/** Decides between the sign-in experience and the app. The sign-in card's phase is derived from the real
 * state: a pending provider round trip, the server's session answer and callback errors. */
function Gate() {
  const session = useSession()
  const health = useHealth()
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  const { pending, leaving } = usePendingLogin()
  const expired = useSessionExpired()
  const authError = new URLSearchParams(search).get('auth_error')
  const returnTo = pathname + withoutAuthError(search)

  let phase: AuthPhase | null = null
  if (pending && leaving) phase = { kind: 'redirecting', provider: pending.provider }
  else if (authError) phase = { kind: 'error', message: authError }
  else if (pending) {
    if (session.isPending) phase = { kind: 'verifying', provider: pending.provider }
    else if (session.data?.authenticated) phase = { kind: 'success', session: session.data }
    else if (session.data) phase = { kind: 'error', message: 'Вход не был подтверждён — возможно, его отменили на странице провайдера.' }
  } else if (session.data && !session.data.authenticated && (health.data?.require_login ?? !health.isError)) {
    phase = { kind: 'idle', expired }
  }

  // a callback error resolves any pending sign-in
  useEffect(() => {
    if (authError && pending && !leaving) finishLogin()
  }, [authError, pending, leaving])

  const retry = useCallback(() => {
    finishLogin()
    if (authError) navigate({ pathname, search: withoutAuthError(search) }, { replace: true })
  }, [authError, navigate, pathname, search])

  if (phase) return <AuthScreen phase={phase} returnTo={returnTo} onRetry={retry} onSuccessShown={finishLogin} />
  if (session.error && !session.data) return <ErrorState error={session.error} onRetry={() => session.refetch()} className="mt-10" />
  if (session.isPending || (pending && !session.data)) return <BootSplash />
  return (
    <>
      <RouteTransition />
      {session.data?.authenticated && (
        <>
          <JobWatcher />
          <PasteToScout />
        </>
      )}
    </>
  )
}

export function AppLayout() {
  const links = useNavLinks()
  const { data: session } = useSession()
  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#main" className="sr-only z-50 rounded-md bg-card px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        К содержимому
      </a>
      <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4">
          <Link to="/" className="shrink-0 rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" aria-label="FACEIT Intelligence by limelightttt — главная">
            <BrandMark className="[&>span:last-child]:hidden xl:[&>span:last-child]:flex" />
          </Link>
          <nav className="flex min-w-0 items-center gap-0.5 overflow-x-auto" aria-label="Основная навигация">
            {links.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                aria-label={n.label}
                className={({ isActive }) =>
                  cn(
                    'pressable flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                    isActive ? 'bg-card-2 text-foreground' : 'text-muted-foreground hover:bg-card-2/60 hover:text-foreground',
                  )
                }
              >
                <n.icon className="size-4" />
                <span className="hidden lg:inline">{n.label}</span>
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex min-w-0 items-center gap-1">
            {session?.authenticated && <CommandPalette links={[...links, { to: '/settings', label: 'Настройки', icon: Settings }]} />}
            <Account />
            <ThemeToggle />
          </div>
        </div>
        <RouteProgress />
      </header>
      <ConnectionBanner />
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 focus:outline-none">
        <Gate />
      </main>
      <footer className="mx-auto w-full max-w-7xl px-4 pb-8 text-xs text-subtle-foreground">
        <span className="font-medium text-muted-foreground">FACEIT Intelligence by limelightttt</span> · Не аффилировано с FACEIT или Valve. Прогнозы, оценки Elo, риск-сигналы и анализ матчмейкинга — исследовательские, не официальные и не обвинения.
      </footer>
      <ScrollRestoration />
    </div>
  )
}
