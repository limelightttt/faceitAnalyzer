import { Crosshair } from 'lucide-react'

import { cn } from '@/shared/lib/cn'

export function BrandMark({ size = 'sm', className }: { size?: 'sm' | 'lg'; className?: string }) {
  return (
    <span className={cn('flex items-center gap-2', className)}>
      <span className={cn('flex items-center justify-center rounded-lg bg-primary text-primary-foreground', size === 'lg' ? 'size-11' : 'size-7')}>
        <Crosshair className={size === 'lg' ? 'size-6' : 'size-4'} />
      </span>
      <span className="flex flex-col leading-none">
        <span className={cn('font-semibold tracking-tight', size === 'lg' ? 'text-2xl' : 'text-sm')}>FACEIT Intelligence</span>
        <span className={cn('text-subtle-foreground', size === 'lg' ? 'mt-1 text-sm' : 'mt-0.5 text-[10px]')}>by limelightttt</span>
      </span>
    </span>
  )
}
