import { LogIn, LogOut } from 'lucide-react'

import { loginUrl, useLogout, useSession } from '@/entities/session'
import { cn } from '@/shared/lib/cn'
import { Button, Hint } from '@/shared/ui'

function SteamIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4 fill-current">
      <path d="M12 2a10 10 0 0 0-9.96 9.2l5.35 2.21a2.83 2.83 0 0 1 1.6-.5h.16l2.38-3.45v-.05a3.77 3.77 0 1 1 3.77 3.77h-.09l-3.4 2.42v.13a2.84 2.84 0 0 1-5.62.57L2.4 14.7A10 10 0 1 0 12 2Zm-4.27 15.2-1.23-.5a2.13 2.13 0 1 0 1.17-2.9l1.27.53a1.57 1.57 0 1 1-1.2 2.9Zm9.5-7.98a2.51 2.51 0 1 0-2.5 2.51 2.51 2.51 0 0 0 2.5-2.5Zm-4.4 0a1.89 1.89 0 1 1 1.9 1.88 1.89 1.89 0 0 1-1.9-1.88Z" />
    </svg>
  )
}

export function LoginButtons({ returnTo, link = false, className, size = 'default' }: { returnTo?: string; link?: boolean; className?: string; size?: 'default' | 'lg' | 'sm' }) {
  const { data } = useSession()
  const faceit = data?.providers.faceit.configured
  const linked = new Set(data?.identities?.map((i) => i.provider))
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {!linked.has('steam') && (
        <Button asChild size={size} variant="secondary">
          <a href={loginUrl('steam', returnTo, link)}>
            <SteamIcon /> {link ? 'Привязать Steam' : 'Войти через Steam'}
          </a>
        </Button>
      )}
      {!linked.has('faceit') &&
        (faceit ? (
          <Button asChild size={size}>
            <a href={loginUrl('faceit', returnTo, link)}>
              <LogIn /> {link ? 'Привязать FACEIT' : 'Войти через FACEIT'}
            </a>
          </Button>
        ) : (
          <Hint content="Нужны FACEIT_CLIENT_ID и FACEIT_CLIENT_SECRET (приложение в FACEIT Developers). Steam-вход работает без них.">
            <span>
              <Button size={size} disabled>
                <LogIn /> FACEIT-вход не настроен
              </Button>
            </span>
          </Hint>
        ))}
    </div>
  )
}

export function LogoutButton() {
  const logout = useLogout()
  return (
    <Button variant="ghost" size="sm" onClick={() => logout.mutate()} disabled={logout.isPending}>
      <LogOut /> Выйти
    </Button>
  )
}
