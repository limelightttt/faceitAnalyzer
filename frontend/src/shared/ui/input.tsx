import * as React from 'react'

import { cn } from '@/shared/lib/cn'

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'flex h-10 w-full rounded-lg border bg-card px-3 text-sm transition-[border-color,box-shadow] duration-[var(--dur-fast)] placeholder:text-subtle-foreground hover:border-foreground/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 aria-invalid:border-critical/60',
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = 'Input'
