import { Check, X } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/shared/lib/cn'

import { Progress } from './progress'
import { Spinner } from './spinner'

export interface JobStep {
  key: string
  label: string
  state: 'pending' | 'active' | 'done' | 'error'
  detail?: ReactNode
}

/** Lifecycle of a long server operation (Match Scout, demo parsing): real steps reported by the server,
 * a real percentage when one exists, an indeterminate bar otherwise. Never claims success by itself. */
export function JobProgress({
  title,
  steps,
  value,
  note,
  footer,
  className,
}: {
  title: ReactNode
  steps: JobStep[]
  /** 0..100 measured progress, or null when the server cannot know */
  value: number | null
  note?: ReactNode
  footer?: ReactNode
  className?: string
}) {
  const active = steps.find((s) => s.state === 'active')
  return (
    <section className={cn('animate-enter mx-auto w-full max-w-lg rounded-2xl border bg-card p-6 shadow-sm sm:p-8', className)} aria-busy={Boolean(active)}>
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Spinner className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          {/* announced to screen readers when the step changes */}
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {active?.label ?? ' '}
          </p>
        </div>
      </div>
      <Progress value={value} className="mt-5" label="Прогресс операции" />
      <ol className="mt-5 space-y-2.5">
        {steps.map((s) => (
          <li key={s.key} className="flex items-start gap-3 text-sm">
            <span
              className={cn(
                'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors duration-[var(--dur-base)]',
                s.state === 'done' && 'border-good/40 bg-good/15 text-good-text',
                s.state === 'active' && 'border-primary/50 text-primary',
                s.state === 'error' && 'border-critical/50 bg-critical/10 text-critical-text',
                s.state === 'pending' && 'text-subtle-foreground',
              )}
            >
              {s.state === 'done' ? <Check className="animate-pop-in size-3" /> : s.state === 'active' ? <Spinner className="size-3" /> : s.state === 'error' ? <X className="size-3" /> : <span className="size-1.5 rounded-full bg-current opacity-50" />}
            </span>
            <span className="min-w-0">
              <span className={cn(s.state === 'pending' ? 'text-muted-foreground' : 'text-foreground', s.state === 'active' && 'font-medium')}>{s.label}</span>
              {s.detail && <span className="block text-xs text-muted-foreground tabular">{s.detail}</span>}
            </span>
          </li>
        ))}
      </ol>
      {note && <p className="mt-5 text-xs leading-relaxed text-muted-foreground">{note}</p>}
      {footer && <div className="mt-4 flex flex-wrap gap-2">{footer}</div>}
    </section>
  )
}
