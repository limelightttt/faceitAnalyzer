import { ChevronDown } from 'lucide-react'
import { type ReactNode, useState } from 'react'

/** A report section, addressable from the section nav. Sections with nothing to show yet start folded to one
 * line (`folded` explains why) — still one click away, never removed. */
export function ReportSection({ id, title, folded, children }: { id: string; title: string; folded?: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(!folded)
  return (
    <section id={id} aria-label={title} className="scroll-mt-28">
      {open ? (
        children
      ) : (
        <button
          type="button"
          aria-expanded={false}
          onClick={() => setOpen(true)}
          className="pressable flex w-full items-center gap-3 rounded-xl border border-dashed bg-card/50 px-4 py-3 text-left text-sm hover:bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <span className="font-medium">{title}</span>
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{folded}</span>
          <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
            Показать <ChevronDown className="size-3.5" />
          </span>
        </button>
      )}
    </section>
  )
}
