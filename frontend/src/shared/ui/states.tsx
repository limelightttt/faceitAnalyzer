import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  CloudOff,
  Gauge,
  Inbox,
  Info,
  Lock,
  type LucideIcon,
  SearchX,
  ServerCrash,
  WifiOff,
} from 'lucide-react'
import { type ReactNode, useState } from 'react'

import { type ApiErrorKind, describeError, errorKind } from '@/shared/api/errors'
import { cn } from '@/shared/lib/cn'

import { Button } from './button'

type Tone = 'neutral' | 'critical' | 'warning' | 'info' | 'success'

const TONE: Record<Tone, { box: string; icon: string }> = {
  neutral: { box: 'border-dashed', icon: 'bg-card-2 text-subtle-foreground' },
  critical: { box: 'border-critical/30 bg-critical/[0.04]', icon: 'bg-critical/10 text-critical-text' },
  warning: { box: 'border-warning/40 bg-warning/[0.06]', icon: 'bg-warning/15 text-foreground' },
  info: { box: 'border-series-1/30 bg-series-1/[0.04]', icon: 'bg-series-1/10 text-series-1' },
  success: { box: 'border-good/30 bg-good/[0.04]', icon: 'bg-good/10 text-good-text' },
}

/** The single building block of full states (error, empty, offline, not found, access denied…). */
export function StatusPanel({
  icon: Icon,
  tone = 'neutral',
  title,
  children,
  actions,
  className,
  role,
}: {
  icon: LucideIcon
  tone?: Tone
  title: ReactNode
  children?: ReactNode
  actions?: ReactNode
  className?: string
  role?: 'alert' | 'status'
}) {
  return (
    <div role={role} className={cn('animate-enter flex flex-col items-center justify-center gap-3 rounded-xl border p-8 text-center', TONE[tone].box, className)}>
      <span className={cn('flex size-10 items-center justify-center rounded-full', TONE[tone].icon)}>
        <Icon className="size-5" />
      </span>
      <div className="text-sm font-medium">{title}</div>
      {children && <div className="max-w-md text-xs leading-relaxed text-muted-foreground">{children}</div>}
      {actions && <div className="mt-1 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  )
}

const ERROR_LOOK: Record<ApiErrorKind, { icon: LucideIcon; tone: Tone }> = {
  offline: { icon: WifiOff, tone: 'warning' },
  unreachable: { icon: ServerCrash, tone: 'critical' },
  timeout: { icon: Clock, tone: 'warning' },
  unauthorized: { icon: Lock, tone: 'warning' },
  forbidden: { icon: Lock, tone: 'warning' },
  not_found: { icon: SearchX, tone: 'neutral' },
  conflict: { icon: Info, tone: 'info' },
  invalid: { icon: AlertTriangle, tone: 'warning' },
  rate_limited: { icon: Gauge, tone: 'warning' },
  faceit_unavailable: { icon: CloudOff, tone: 'warning' },
  server: { icon: AlertTriangle, tone: 'critical' },
}

/** A failed screen or section. The look and copy follow the error kind; "Повторить" shows its own
 * pending state and is offered only when a retry can help. */
export function ErrorState({
  error,
  onRetry,
  notFound,
  action,
  className,
}: {
  error: unknown
  onRetry?: () => unknown
  /** what was not found, e.g. "Игрок не найден" */
  notFound?: string
  action?: ReactNode
  className?: string
}) {
  const [retrying, setRetrying] = useState(false)
  const copy = describeError(error, { notFound })
  const kind = errorKind(error)
  const look = kind ? ERROR_LOOK[kind] : { icon: AlertTriangle, tone: 'critical' as Tone }
  const retry = async () => {
    if (!onRetry) return
    setRetrying(true)
    try {
      await onRetry()
    } finally {
      setRetrying(false)
    }
  }
  return (
    <StatusPanel
      role="alert"
      icon={look.icon}
      tone={look.tone}
      title={copy.title}
      className={className}
      actions={
        (onRetry && copy.retryable) || action ? (
          <>
            {onRetry && copy.retryable && (
              <Button size="sm" variant="secondary" onClick={retry} loading={retrying}>
                Повторить
              </Button>
            )}
            {action}
          </>
        ) : undefined
      }
    >
      {copy.message}
    </StatusPanel>
  )
}

export function EmptyState({ title, children, icon = Inbox, action, className }: { title: string; children?: ReactNode; icon?: LucideIcon; action?: ReactNode; className?: string }) {
  return (
    <StatusPanel icon={icon} title={title} actions={action} className={className}>
      {children}
    </StatusPanel>
  )
}

/** Nothing loaded yet and the device is offline: the request waits and resumes by itself. */
export function OfflineState({ className }: { className?: string }) {
  return (
    <StatusPanel role="status" icon={WifiOff} tone="warning" title="Нет подключения к интернету" className={className}>
      Данные загрузятся автоматически, когда связь появится.
    </StatusPanel>
  )
}

/** A one-line contextual notice inside a page (limits, partial data, stale cache…). */
export function Notice({ tone = 'warning', icon, children, className }: { tone?: Exclude<Tone, 'neutral'>; icon?: LucideIcon; children: ReactNode; className?: string }) {
  const Icon = icon ?? (tone === 'success' ? CheckCircle2 : tone === 'info' ? Info : AlertTriangle)
  const box = {
    critical: 'border-critical/40 bg-critical/5',
    warning: 'border-warning/50 bg-warning/10',
    info: 'border-series-1/30 bg-series-1/5',
    success: 'border-good/30 bg-good/5',
  }[tone]
  return (
    <div role={tone === 'critical' ? 'alert' : 'status'} className={cn('animate-enter flex items-start gap-2 rounded-lg border px-3 py-2 text-xs leading-relaxed', box, className)}>
      <Icon className={cn('mt-px size-3.5 shrink-0', tone === 'critical' ? 'text-critical-text' : tone === 'success' ? 'text-good-text' : tone === 'info' ? 'text-series-1' : 'text-foreground')} />
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/** Error of a form/control shown next to it (instead of a toast). Shakes once to tie it to the action. */
export function InlineError({ error, className }: { error: unknown; className?: string }) {
  if (!error) return null
  const copy = describeError(error)
  const kind = errorKind(error)
  const text = kind === 'invalid' || kind === 'conflict' || kind === 'forbidden' || !kind ? copy.message : `${copy.title}. ${copy.message}`
  return (
    <div role="alert" className={cn('animate-shake flex items-start gap-1.5 text-xs text-critical-text', className)}>
      <AlertTriangle className="mt-px size-3.5 shrink-0" />
      <span>{text}</span>
    </div>
  )
}
