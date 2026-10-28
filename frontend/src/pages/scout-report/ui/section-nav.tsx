import { useEffect, useState } from 'react'

import { cn } from '@/shared/lib/cn'

export interface SectionLink {
  id: string
  label: string
}

/** Sticky table of contents for a long report; highlights the section being read. */
export function SectionNav({ sections }: { sections: SectionLink[] }) {
  const [active, setActive] = useState(sections[0]?.id)
  useEffect(() => {
    const visible = new Map<string, number>()
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.set(e.target.id, e.boundingClientRect.top)
          else visible.delete(e.target.id)
        }
        const top = [...visible.entries()].sort((a, b) => a[1] - b[1])[0]
        if (top) setActive(top[0])
      },
      { rootMargin: '-120px 0px -55% 0px' },
    )
    sections.forEach((s) => {
      const el = document.getElementById(s.id)
      if (el) io.observe(el)
    })
    return () => io.disconnect()
  }, [sections])
  return (
    <nav aria-label="Разделы отчёта" className="sticky top-14 z-30 -mx-4 border-b bg-background/90 px-4 backdrop-blur">
      <div className="flex gap-1 overflow-x-auto py-2">
        {sections.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            aria-current={active === s.id ? 'location' : undefined}
            className={cn(
              'pressable shrink-0 rounded-md px-2.5 py-1 text-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
              active === s.id ? 'bg-card-2 font-medium text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {s.label}
          </a>
        ))}
      </div>
    </nav>
  )
}
