import * as React from 'react'

import { cn } from '@/shared/lib/cn'

export function Table({ className, ...props }: React.HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="relative w-full overflow-x-auto">
      <table className={cn('w-full caption-bottom text-sm tabular', className)} {...props} />
    </div>
  )
}
export const THead = (p: React.HTMLAttributes<HTMLTableSectionElement>) => <thead {...p} />
export const TBody = (p: React.HTMLAttributes<HTMLTableSectionElement>) => <tbody {...p} />
export function TR({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn('border-b last:border-0 transition-colors', className)} {...props} />
}
export function TH({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn('h-9 px-3 text-left align-middle text-xs font-medium text-subtle-foreground whitespace-nowrap', className)}
      {...props}
    />
  )
}
export function TD({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-3 py-2.5 align-middle whitespace-nowrap', className)} {...props} />
}
