import { AlertTriangle, Inbox } from 'lucide-react'
import type { ReactNode } from 'react'

import { Skeleton } from './skeleton'

export function ErrorState({ error, action }: { error: unknown; action?: ReactNode }) {
  const msg = error instanceof Error ? error.message : String(error)
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-critical/30 bg-critical/5 p-8 text-center">
      <AlertTriangle className="size-6 text-critical-text" />
      <div className="text-sm font-medium">Не удалось загрузить данные</div>
      <div className="max-w-md text-xs text-muted-foreground">{msg}</div>
      {action}
    </div>
  )
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-8 text-center">
      <Inbox className="size-5 text-subtle-foreground" />
      <div className="text-sm font-medium">{title}</div>
      {children && <div className="max-w-md text-xs text-muted-foreground">{children}</div>}
    </div>
  )
}

export function PageSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-72" />
      <Skeleton className="h-48" />
    </div>
  )
}
