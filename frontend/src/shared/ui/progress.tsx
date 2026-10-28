import * as ProgressPrimitive from '@radix-ui/react-progress'

import { cn } from '@/shared/lib/cn'

/** Determinate progress for real measured values; `value={null}` is the honest "unknown" state:
 * an indeterminate sweep instead of invented percentages. */
export function Progress({ value, className, label, tone = 'series' }: { value: number | null; className?: string; label?: string; tone?: 'series' | 'primary' | 'good' }) {
  const bar = tone === 'primary' ? 'bg-primary' : tone === 'good' ? 'bg-good' : 'bg-series-1'
  const track = tone === 'primary' ? 'bg-primary/15' : tone === 'good' ? 'bg-good/15' : 'bg-series-1/15'
  return (
    <ProgressPrimitive.Root aria-label={label} className={cn('relative h-2 w-full overflow-hidden rounded-full', track, className)} value={value}>
      {value === null ? (
        <ProgressPrimitive.Indicator className={cn('motion-essential h-full w-full origin-left rounded-full', bar)} style={{ animation: 'fi-indeterminate 1.3s var(--ease-morph) infinite' }} />
      ) : (
        <ProgressPrimitive.Indicator
          className={cn('h-full w-full rounded-full', bar)}
          style={{ transform: `translateX(-${100 - Math.max(0, Math.min(100, value))}%)`, transition: 'transform var(--dur-slow) var(--ease-morph)' }}
        />
      )}
    </ProgressPrimitive.Root>
  )
}
