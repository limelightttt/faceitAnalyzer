import { type ReactNode, useLayoutEffect, useRef, useState } from 'react'

import { cn } from '@/shared/lib/cn'

/** Animates its height to fit changing content, so one container can morph between states instead of
 * jumping. The first measurement is applied without animation. */
export function MorphHeight({ children, className }: { children: ReactNode; className?: string }) {
  const inner = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number | undefined>(undefined)
  useLayoutEffect(() => {
    const el = inner.current
    if (!el) return
    const ro = new ResizeObserver(() => setHeight(el.offsetHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <div
      className={cn('overflow-hidden', className)}
      style={{ height, transition: height === undefined ? undefined : 'height var(--dur-slow) var(--ease-morph)' }}
    >
      <div ref={inner}>{children}</div>
    </div>
  )
}
