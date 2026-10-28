import { AlertTriangle, ArrowLeft, BarChart3, FileVideo, Lock, LogIn, Radar, RotateCcw, ShieldCheck } from 'lucide-react'
import { type CSSProperties, useEffect, useState } from 'react'

import { useHealth } from '@/entities/system'
import type { Session } from '@/entities/session'
import { classifyAuthError, finishLogin, LoginButtons, type Provider, SteamIcon } from '@/features/auth'
import { MOTION } from '@/shared/config/motion'
import { cn } from '@/shared/lib/cn'
import { BrandMark, Button, MorphHeight, Notice, Spinner, SuccessCheck } from '@/shared/ui'

export type AuthPhase =
  | { kind: 'idle'; expired?: boolean }
  | { kind: 'redirecting'; provider: Provider }
  | { kind: 'verifying'; provider: Provider }
  | { kind: 'success'; session: Session }
  | { kind: 'error'; message: string }

const PROVIDER = {
  steam: { name: 'Steam', host: 'steamcommunity.com' },
  faceit: { name: 'FACEIT', host: 'accounts.faceit.com' },
} as const

const FEATURES = [
  { icon: Radar, text: 'Разведка матча по ссылке на комнату' },
  { icon: FileVideo, text: 'Разбор ваших демок по раундам' },
  { icon: BarChart3, text: 'Цели и прогресс на реальных данных' },
]

/** The whole sign-in experience is one card whose inner content morphs between phases:
 * idle → redirecting (leaving for the provider) → verifying (back, asking our server) → success | error.
 * Success is shown only after the server confirmed the session. */
export function AuthScreen({ phase, returnTo, onRetry, onSuccessShown }: { phase: AuthPhase; returnTo: string; onRetry: () => void; onSuccessShown?: () => void }) {
  return (
    <div className="flex min-h-[78dvh] items-center justify-center py-6">
      <div className="relative w-full max-w-[420px]">
        <div aria-hidden className="pointer-events-none absolute -inset-x-10 -top-16 h-56 rounded-full bg-primary/15 blur-3xl" />
        <div className="animate-enter relative rounded-2xl border bg-card/95 p-6 shadow-[0_24px_60px_-20px_rgb(0_0_0/0.45)] backdrop-blur sm:p-8">
          <BrandMark size="lg" />
          <MorphHeight>
            <div key={phase.kind} className="animate-enter pt-7">
              {phase.kind === 'idle' && <Idle expired={phase.expired} returnTo={returnTo} />}
              {phase.kind === 'redirecting' && <Redirecting provider={phase.provider} onCancel={onRetry} />}
              {phase.kind === 'verifying' && <Verifying provider={phase.provider} />}
              {phase.kind === 'success' && <Success session={phase.session} onShown={onSuccessShown} />}
              {phase.kind === 'error' && <Failure message={phase.message} onRetry={onRetry} />}
            </div>
          </MorphHeight>
        </div>
        <p className="mt-4 text-center text-[11px] text-subtle-foreground">Не аффилировано с FACEIT или Valve.</p>
      </div>
    </div>
  )
}

function Idle({ expired, returnTo }: { expired?: boolean; returnTo: string }) {
  const health = useHealth()
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <h1 className="text-lg font-semibold tracking-tight">Вход</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">Войдите — приложение само определит ваш FACEIT-профиль и сохранит разведки, прогнозы и цели.</p>
      </div>
      {expired && <Notice tone="info">Сессия истекла. Войдите снова — ваши данные на месте.</Notice>}
      <ul className="space-y-2">
        {FEATURES.map((f, i) => (
          <li key={f.text} className="animate-enter flex items-center gap-2.5 text-xs text-muted-foreground" style={{ '--i': i + 1 } as CSSProperties}>
            <span className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary">
              <f.icon className="size-3.5" />
            </span>
            {f.text}
          </li>
        ))}
      </ul>
      <LoginButtons returnTo={returnTo} size="lg" className="flex-col [&>*]:w-full" />
      <div className="space-y-1.5 border-t pt-4 text-[11px] leading-relaxed text-subtle-foreground">
        <p className="flex items-start gap-1.5">
          <ShieldCheck className="mt-px size-3.5 shrink-0" /> Вход подтверждают сами Steam или FACEIT. Пароль приложению не передаётся.
        </p>
        {health.data?.private_beta && (
          <p className="flex items-start gap-1.5">
            <Lock className="mt-px size-3.5 shrink-0" /> Закрытая бета: доступ только для приглашённых аккаунтов.
          </p>
        )}
      </div>
    </div>
  )
}

function ProviderBadge({ provider, busy }: { provider: Provider; busy?: boolean }) {
  return (
    <span className="relative flex size-14 items-center justify-center">
      {busy && <span aria-hidden className="motion-essential absolute inset-0 animate-ping rounded-full bg-primary/20 [animation-duration:1.6s]" />}
      <span className={cn('relative flex size-14 items-center justify-center rounded-full border', provider === 'faceit' ? 'bg-primary text-primary-foreground' : 'bg-card-2 text-foreground')}>
        {provider === 'steam' ? <SteamIcon className="size-7" /> : <LogIn className="size-6" />}
      </span>
    </span>
  )
}

function Redirecting({ provider, onCancel }: { provider: Provider; onCancel: () => void }) {
  const p = PROVIDER[provider]
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 8000)
    return () => clearTimeout(t)
  }, [])
  return (
    <div className="flex flex-col items-center gap-4 pb-2 text-center" role="status">
      <ProviderBadge provider={provider} busy />
      <div className="space-y-1">
        <h1 className="text-base font-semibold">Переходим в {p.name}…</h1>
        <p className="text-xs text-muted-foreground">
          Войдите на <span className="font-medium text-foreground">{p.host}</span> — после подтверждения вы вернётесь сюда.
        </p>
      </div>
      {slow && (
        <div className="animate-enter flex flex-col items-center gap-2">
          <p className="text-xs text-muted-foreground">Страница {p.name} открывается дольше обычного.</p>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            <ArrowLeft /> Назад к входу
          </Button>
        </div>
      )}
    </div>
  )
}

function Verifying({ provider }: { provider: Provider }) {
  return (
    <div className="flex flex-col items-center gap-4 pb-2 text-center" role="status" aria-live="polite">
      <span className="relative flex size-14 items-center justify-center rounded-full border bg-card-2">
        <Spinner className="size-6 text-primary" />
      </span>
      <div className="space-y-1">
        <h1 className="text-base font-semibold">Проверяем вход…</h1>
        <p className="text-xs text-muted-foreground">{PROVIDER[provider].name} вернул вас в приложение. Подтверждаем сессию на сервере.</p>
      </div>
    </div>
  )
}

function Success({ session, onShown }: { session: Session; onShown?: () => void }) {
  useEffect(() => {
    if (!onShown) return
    const t = setTimeout(onShown, MOTION.successHoldMs)
    return () => clearTimeout(t)
  }, [onShown])
  const name = session.game_profile?.nickname ?? session.identities?.[0]?.display_name
  return (
    <div className="flex flex-col items-center gap-3 pb-2 text-center" role="status" aria-live="polite">
      <SuccessCheck />
      <div className="space-y-1">
        <h1 className="text-base font-semibold">Вход подтверждён</h1>
        <p className="text-xs text-muted-foreground">{name ? <>Добро пожаловать, <span className="font-medium text-foreground">{name}</span>.</> : 'Добро пожаловать.'} Открываем приложение…</p>
      </div>
    </div>
  )
}

function Failure({ message, onRetry }: { message: string; onRetry: () => void }) {
  const f = classifyAuthError(message)
  return (
    <div className="flex flex-col items-center gap-4 pb-2 text-center">
      <span className="animate-shake flex size-14 items-center justify-center rounded-full bg-critical/10 text-critical-text">
        {f.kind === 'allowlist' ? <Lock className="size-6" /> : <AlertTriangle className="size-6" />}
      </span>
      <div role="alert" className="space-y-1.5">
        <h1 className="text-base font-semibold">{f.title}</h1>
        <p className="text-xs leading-relaxed text-muted-foreground">{f.hint}</p>
        {message && <p className="rounded-md bg-card-2 px-2.5 py-1.5 text-[11px] text-muted-foreground">{message}</p>}
      </div>
      <Button
        className="w-full"
        onClick={() => {
          finishLogin()
          onRetry()
        }}
      >
        <RotateCcw /> {f.kind === 'allowlist' || f.kind === 'linked' ? 'Войти другим аккаунтом' : 'Попробовать снова'}
      </Button>
    </div>
  )
}
