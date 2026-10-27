import * as ProgressPrimitive from '@radix-ui/react-progress'

import { cn } from '@/shared/lib/cn'

export function Progress({ value, className }: { value: number; className?: string }) {
  return (
    <ProgressPrimitive.Root className={cn('relative h-2 w-full overflow-hidden rounded-full bg-series-1/15', className)} value={value}>
      <ProgressPrimitive.Indicator
        className="h-full bg-series-1 transition-transform"
        style={{ transform: `translateX(-${100 - value}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}
