import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import * as React from 'react'

import { cn } from '@/shared/lib/cn'

export const TooltipProvider = TooltipPrimitive.Provider

export function Hint({ content, children, className }: { content: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          sideOffset={6}
          className={cn('popover-motion z-50 max-w-xs rounded-md border bg-card px-3 py-2 text-xs text-foreground shadow-lg', className)}
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}
