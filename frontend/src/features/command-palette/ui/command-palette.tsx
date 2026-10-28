import { CornerDownLeft, History, type LucideIcon, Radar, Search, UserRound } from 'lucide-react'
import { type KeyboardEvent, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useHistory, useSession } from '@/entities/session'
import { useLaunchScout } from '@/features/omni-search'
import { cn } from '@/shared/lib/cn'
import { parseFaceitRef } from '@/shared/lib/faceit-ref'
import { dateTime } from '@/shared/lib/format'
import { Button, Dialog, DialogContent } from '@/shared/ui'

export interface PaletteLink {
  to: string
  label: string
  icon: LucideIcon
}

interface Item {
  id: string
  label: string
  hint?: string
  icon: LucideIcon
  run: () => void
}

const MOD = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'
const HISTORY_PATH: Record<string, (ref: string) => string> = {
  scout: (ref) => `/scout/${ref}`,
  demo: (ref) => `/demos/${ref}`,
  player: (ref) => `/players/${encodeURIComponent(ref)}`,
}
const HISTORY_KIND: Record<string, string> = { scout: 'разведка', demo: 'демка', player: 'игрок' }

/** Ctrl/⌘+K from anywhere: paste a room link or type a nickname, jump to a page or a recent analysis. */
export function CommandPalette({ links }: { links: PaletteLink[] }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} aria-label="Поиск и быстрые действия" aria-keyshortcuts="Control+K Meta+K" className="text-muted-foreground lg:w-52 lg:justify-start">
        <Search />
        <span className="hidden lg:inline">Ссылка или ник…</span>
        <kbd className="ml-auto hidden rounded border bg-card-2 px-1.5 font-sans text-[10px] lg:inline">{MOD} K</kbd>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Поиск и быстрые действия">{open && <Palette links={links} close={() => setOpen(false)} />}</DialogContent>
      </Dialog>
    </>
  )
}

function Palette({ links, close }: { links: PaletteLink[]; close: () => void }) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const navigate = useNavigate()
  const { launch } = useLaunchScout()
  const { data: session } = useSession()
  const history = useHistory(Boolean(session?.authenticated))

  const items = useMemo<Item[]>(() => {
    const go = (to: string) => () => navigate(to)
    const q = query.trim().toLowerCase()
    const ref = parseFaceitRef(query)
    const direct: Item[] =
      ref?.kind === 'room'
        ? [{ id: 'scout', label: 'Разведка матча', hint: ref.matchId.slice(0, 13) + '…', icon: Radar, run: () => launch(ref.matchId) }]
        : ref?.kind === 'player'
          ? [{ id: 'player', label: `Открыть игрока ${ref.nickname}`, icon: UserRound, run: go(`/players/${encodeURIComponent(ref.nickname)}`) }]
          : []
    const pages: Item[] = links.map((l) => ({ id: `page:${l.to}`, label: l.label, icon: l.icon, run: go(l.to) }))
    const recent: Item[] = (history.data ?? [])
      .filter((h) => HISTORY_PATH[h.kind])
      .slice(0, 8)
      .map((h) => ({ id: `h:${h.kind}:${h.ref}:${h.at}`, label: h.label || h.ref, hint: `${HISTORY_KIND[h.kind]} · ${dateTime(h.at)}`, icon: History, run: go(HISTORY_PATH[h.kind](h.ref)) }))
    const match = (i: Item) => !q || i.label.toLowerCase().includes(q) || i.hint?.toLowerCase().includes(q)
    return [...direct, ...pages.filter(match), ...recent.filter(match)]
  }, [query, links, history.data, navigate, launch])

  const run = (i: Item | undefined) => {
    if (!i) return
    close()
    i.run()
  }
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const step = e.key === 'ArrowDown' ? 1 : -1
      setActive((a) => (items.length ? (a + step + items.length) % items.length : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      run(items[active])
    }
  }
  const activeId = items[active] ? `palette-${active}` : undefined
  return (
    <div className="flex max-h-[70vh] flex-col">
      <div className="flex items-center gap-3 border-b px-4">
        <Search className="size-4 shrink-0 text-subtle-foreground" />
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
          }}
          onKeyDown={onKeyDown}
          placeholder="Ссылка на комнату, ник или раздел…"
          aria-label="Ссылка на комнату, ник или раздел"
          role="combobox"
          aria-expanded
          aria-controls="palette-list"
          aria-activedescendant={activeId}
          className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-subtle-foreground"
        />
      </div>
      <ul id="palette-list" role="listbox" aria-label="Результаты" className="overflow-y-auto p-2">
        {items.length === 0 && <li className="px-3 py-6 text-center text-xs text-muted-foreground">Ничего не найдено. Вставьте ссылку на комнату или ник FACEIT.</li>}
        {items.map((item, i) => (
          <li
            key={item.id}
            id={`palette-${i}`}
            role="option"
            aria-selected={i === active}
            onMouseMove={() => setActive(i)}
            onClick={() => run(item)}
            className={cn('flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-[var(--dur-fast)]', i === active ? 'bg-card-2 text-foreground' : 'text-muted-foreground')}
          >
            <item.icon className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.hint && <span className="shrink-0 text-xs text-subtle-foreground">{item.hint}</span>}
            {i === active && <CornerDownLeft className="size-3.5 shrink-0 text-subtle-foreground" />}
          </li>
        ))}
      </ul>
    </div>
  )
}
