import { LocateFixed, Radar, Search, UserRound } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useDetectMatch } from '@/entities/scout'
import { useSession } from '@/entities/session'
import { cn } from '@/shared/lib/cn'
import { parseFaceitRef } from '@/shared/lib/faceit-ref'
import { Button, InlineError, Input } from '@/shared/ui'

import { useLaunchScout } from '../model/use-launch-scout'

const HINT = 'Вставьте ссылку на комнату матча или ник игрока FACEIT'

/** One field for everything: a match room link starts Match Scout, a nickname (or profile link) opens the
 * player. The button says what will happen before it is pressed. */
export function OmniSearch({ size = 'default', withDetect = false, className }: { size?: 'default' | 'lg'; withDetect?: boolean; className?: string }) {
  const [value, setValue] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const navigate = useNavigate()
  const { launch, start } = useLaunchScout({ inline: true })
  const detect = useDetectMatch()
  const { data: session } = useSession()
  const ref = parseFaceitRef(value)
  const busy = start.isPending || start.isSuccess || detect.isPending

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (!ref) return setNote(HINT)
    if (ref.kind === 'room') launch(ref.matchId)
    else navigate(`/players/${encodeURIComponent(ref.nickname)}`)
  }
  const error = note ?? start.error ?? detect.error
  const btn = size === 'lg' ? 'lg' : 'default'
  const action = ref?.kind === 'room' ? { icon: Radar, label: 'Разведка' } : ref?.kind === 'player' ? { icon: UserRound, label: 'Открыть игрока' } : { icon: Search, label: 'Найти' }
  return (
    <div className={cn('space-y-2', className)}>
      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row" role="search" noValidate>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle-foreground" />
          <Input
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              if (note) setNote(null)
            }}
            placeholder="Ссылка на комнату или ник FACEIT"
            aria-label="Ссылка на комнату или ник FACEIT"
            aria-invalid={Boolean(error) || undefined}
            className={cn('pl-9', size === 'lg' && 'h-12 text-base')}
            disabled={busy}
          />
        </div>
        <Button type="submit" size={btn} disabled={!value.trim()} loading={start.isPending || start.isSuccess} className="min-w-36">
          <action.icon /> {action.label}
        </Button>
        {withDetect && session?.game_profile && (
          <Button
            type="button"
            variant="secondary"
            size={btn}
            loading={detect.isPending}
            disabled={busy}
            onClick={() =>
              detect.mutate(undefined, {
                onSuccess: (r) => (r.found && r.match_id ? launch(r.match_id) : setNote(r.reason ?? 'Активный матч не найден')),
              })
            }
          >
            <LocateFixed /> Найти мой матч
          </Button>
        )}
      </form>
      <InlineError key={String(note ?? (error instanceof Error ? error.message : ''))} error={error} />
    </div>
  )
}
