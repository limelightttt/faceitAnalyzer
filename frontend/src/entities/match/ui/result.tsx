import { cn } from '@/shared/lib/cn'
import { mapName } from '@/shared/lib/format'

export function ResultPill({ won, className }: { won: boolean | null; className?: string }) {
  if (won === null) return <span className={cn('text-xs text-subtle-foreground', className)}>—</span>
  return (
    <span
      className={cn(
        'inline-flex h-5 w-5 items-center justify-center rounded text-[11px] font-bold',
        won ? 'bg-good/15 text-good-text' : 'bg-critical/15 text-critical-text',
        className,
      )}
      aria-label={won ? 'Победа' : 'Поражение'}
    >
      {won ? 'W' : 'L'}
    </span>
  )
}

const MAP_TINT: Record<string, string> = {
  de_mirage: '#c9a46b',
  de_inferno: '#b5643c',
  de_dust2: '#d8b46a',
  de_nuke: '#6b8aa6',
  de_ancient: '#5f8a5a',
  de_anubis: '#c19a4a',
  de_train: '#7d7f86',
  de_vertigo: '#8aa0b8',
  de_overpass: '#6f8f7a',
}

export function MapChip({ map }: { map: string | null }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="inline-block size-2.5 rounded-sm" style={{ background: MAP_TINT[map ?? ''] ?? 'var(--subtle-foreground)' }} />
      {mapName(map)}
    </span>
  )
}

export function ratingTone(r: number | undefined | null) {
  if (r === undefined || r === null) return ''
  if (r >= 1.15) return 'text-good-text font-semibold'
  if (r < 0.85) return 'text-critical-text'
  return ''
}
