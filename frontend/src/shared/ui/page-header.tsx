import type { ReactNode } from 'react'

/** The one way a page starts: a title, an optional short line, actions on the right. */
export function PageHeader({ title, children, actions }: { title: ReactNode; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {children && <p className="mt-0.5 text-sm text-muted-foreground">{children}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
