import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'

import { cn } from '@/shared/lib/cn'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3',
  {
    variants: {
      variant: {
        default: 'bg-card-2 text-muted-foreground',
        brand: 'border-primary/30 bg-primary/10 text-primary',
        good: 'border-good/30 bg-good/10 text-good-text',
        bad: 'border-critical/30 bg-critical/10 text-critical-text',
        warn: 'border-warning/40 bg-warning/15 text-foreground',
        outline: 'bg-transparent text-muted-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}
