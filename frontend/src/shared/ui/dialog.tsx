import * as DialogPrimitive from '@radix-ui/react-dialog'
import type { ReactNode } from 'react'

import { cn } from '@/shared/lib/cn'

export const Dialog = DialogPrimitive.Root

/** A modal panel near the top of the screen (focus trapped, Esc closes, background inert). The title is
 * always present for screen readers; pass `showTitle` to render it visibly. */
export function DialogContent({ title, showTitle = false, className, children }: { title: string; showTitle?: boolean; className?: string; children: ReactNode }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="overlay-motion fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]" />
      <DialogPrimitive.Content
        aria-describedby={undefined}
        className={cn(
          'popover-motion fixed top-[12vh] left-1/2 z-50 w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border bg-card shadow-[0_24px_60px_-12px_rgb(0_0_0/0.5)] focus:outline-none',
          className,
        )}
      >
        <DialogPrimitive.Title className={showTitle ? 'px-5 pt-4 text-sm font-semibold' : 'sr-only'}>{title}</DialogPrimitive.Title>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}
