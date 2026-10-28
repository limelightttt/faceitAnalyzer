import type { CSSProperties, ReactNode } from 'react'

import { cn } from '@/shared/lib/cn'
import { useDelayed } from '@/shared/lib/use-delayed'

/** One block of a skeleton. Compose them into the shape of the real content. */
export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div aria-hidden className={cn('skeleton', className)} style={style} />
}

/** Wraps a skeleton composition: announces loading once, and reveals itself only for slow requests so a
 * fast response never flashes placeholders. Reserves the final height to avoid layout jumps. */
export function LoadingSkeleton({ children, label = 'Загрузка…', className, minHeight }: { children: ReactNode; label?: string; className?: string; minHeight?: number }) {
  const show = useDelayed(true)
  return (
    <div role="status" aria-busy="true" aria-label={label} className={className} style={{ minHeight }}>
      {show && <div className="animate-fade-in">{children}</div>}
    </div>
  )
}

export function SkeletonText({ lines = 2, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={cn('h-3', i === lines - 1 && lines > 1 ? 'w-3/5' : 'w-full')} />
      ))}
    </div>
  )
}

/** A row of KPI tiles (label, big value, hint) — same box model as StatTile. */
export function SkeletonTiles({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('grid grid-cols-2 gap-3 md:grid-cols-4', className)}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-xl border bg-card p-4">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-3 h-7 w-16" />
          <Skeleton className="mt-2 h-3 w-24" />
        </div>
      ))}
    </div>
  )
}

/** A card with a title, a description line and a body of the given height (chart, list…). */
export function SkeletonCard({ bodyHeight = 200, className, children }: { bodyHeight?: number; className?: string; children?: ReactNode }) {
  return (
    <div className={cn('min-w-0 rounded-xl border bg-card p-5', className)}>
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-2 h-3 w-64 max-w-[80%]" />
      <div className="mt-5">{children ?? <Skeleton className="w-full rounded-lg" style={{ height: bodyHeight }} />}</div>
    </div>
  )
}

/** Chart placeholder: bars rising from a baseline read as "a chart is coming", not "a grey box". */
export function SkeletonChart({ height = 200 }: { height?: number }) {
  const bars = [42, 58, 50, 66, 54, 72, 61, 80, 68, 74, 63, 86]
  return (
    <div className="flex items-end gap-2 border-b pb-px" style={{ height }} aria-hidden>
      {bars.map((h, i) => (
        <Skeleton key={i} className="flex-1 rounded-b-none" style={{ height: `${h}%` }} />
      ))}
    </div>
  )
}

/** Table placeholder with a header row and `rows` lines; first column wider like real tables. */
export function SkeletonTable({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div aria-hidden>
      <div className="flex gap-4 border-b px-5 pb-3">
        {Array.from({ length: cols }, (_, c) => (
          <Skeleton key={c} className={cn('h-3', c === 0 ? 'w-32' : 'w-14')} />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex items-center gap-4 border-b px-5 py-3 last:border-0">
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} className={cn('h-3.5', c === 0 ? 'w-40' : 'w-14')} />
          ))}
        </div>
      ))}
    </div>
  )
}
