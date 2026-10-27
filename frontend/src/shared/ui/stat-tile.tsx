import type { ReactNode } from 'react'

import { cn } from '@/shared/lib/cn'

export function StatTile({
  label,
  value,
  hint,
  delta,
  className,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  delta?: { text: string; good: boolean | null }
  className?: string
}) {
  return (
    <div className={cn('rounded-xl border bg-card p-4', className)}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1.5 text-2xl font-semibold tracking-tight">{value}</div>
      <div className="mt-1 flex min-h-4 items-center gap-2 text-xs text-subtle-foreground">
        {delta && (
          <span
            className={cn(
              'font-medium',
              delta.good === true && 'text-good-text',
              delta.good === false && 'text-critical-text',
            )}
          >
            {delta.good === true ? '▲ ' : delta.good === false ? '▼ ' : ''}
            {delta.text}
          </span>
        )}
        {hint}
      </div>
    </div>
  )
}
