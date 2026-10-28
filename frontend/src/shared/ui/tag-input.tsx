import { X } from 'lucide-react'
import { useState } from 'react'

import { cn } from '@/shared/lib/cn'

import { Badge } from './badge'
import { Button } from './button'
import { Input } from './input'

/** A short list of words (nicknames) edited in place: Enter or "Добавить" adds, × removes. Duplicates are
 * ignored case-insensitively; `max` caps the list. */
export function TagInput({
  values,
  onChange,
  label,
  placeholder = 'ник',
  max,
  locked = [],
  className,
}: {
  values: string[]
  onChange: (next: string[]) => void
  label: string
  placeholder?: string
  max?: number
  /** shown but not removable (e.g. yourself in a stack) */
  locked?: string[]
  className?: string
}) {
  const [draft, setDraft] = useState('')
  const full = max !== undefined && values.length >= max
  const add = () => {
    const v = draft.trim()
    if (v && !full && !values.some((x) => x.toLowerCase() === v.toLowerCase())) onChange([...values, v])
    setDraft('')
  }
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {values.map((v) => (
        <Badge key={v} className="animate-pop-in h-7 gap-1.5 px-2.5 text-xs">
          {v}
          {!locked.includes(v) && (
            <button type="button" aria-label={`Убрать ${v}`} onClick={() => onChange(values.filter((x) => x !== v))} className="rounded hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
              <X />
            </button>
          )}
        </Badge>
      ))}
      {!full && (
        <>
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                add()
              }
            }}
            placeholder={placeholder}
            aria-label={label}
            className="h-8 w-40"
          />
          <Button size="sm" variant="secondary" onClick={add} disabled={!draft.trim()}>
            Добавить
          </Button>
        </>
      )}
    </div>
  )
}
