import { Crosshair, LocateFixed, Radar } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useDetectMatch, useStartScout } from '@/entities/scout'
import { useSession } from '@/entities/session'
import { trackJob } from '@/features/job-tracking'
import { cn } from '@/shared/lib/cn'
import { Button, InlineError, Input } from '@/shared/ui'

const ROOM_RE = /1-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

export function ScoutLaunch({ className, size = 'default' }: { className?: string; size?: 'default' | 'lg' }) {
  const [url, setUrl] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const navigate = useNavigate()
  const start = useStartScout({ inline: true })
  const detect = useDetectMatch()
  const { data: session } = useSession()
  const busy = start.isPending || start.isSuccess || detect.isPending

  const go = (value: string) => {
    setNote(null)
    start.mutate(
      { url: value },
      {
        onSuccess: (r) => {
          trackJob({ kind: 'scout', id: r.id, label: `Матч ${r.match_id.slice(0, 13)}…` })
          navigate(`/scout/${r.id}`)
        },
      },
    )
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (!ROOM_RE.test(url)) {
      setNote('Вставьте ссылку на комнату матча FACEIT: https://www.faceit.com/…/cs2/room/1-…')
      return
    }
    go(url.trim())
  }
  const error = note ?? start.error ?? detect.error
  const inputSize = size === 'lg' ? 'h-12 text-base' : undefined
  return (
    <div className={cn('space-y-2', className)}>
      <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row" aria-label="Разведка матча" noValidate>
        <div className="relative flex-1">
          <Crosshair className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle-foreground" />
          <Input
            value={url}
            onChange={(e) => {
              setUrl(e.target.value)
              if (note) setNote(null)
            }}
            placeholder="Ссылка на комнату матча FACEIT"
            aria-label="Ссылка на комнату матча FACEIT"
            aria-invalid={Boolean(error) || undefined}
            className={cn('pl-9', inputSize)}
            disabled={busy}
          />
        </div>
        <Button type="submit" size={size === 'lg' ? 'lg' : 'default'} disabled={!url.trim()} loading={start.isPending || start.isSuccess}>
          <Radar /> Разведка
        </Button>
        {session?.authenticated && session.game_profile && (
          <Button
            type="button"
            variant="secondary"
            size={size === 'lg' ? 'lg' : 'default'}
            loading={detect.isPending}
            disabled={busy}
            onClick={() =>
              detect.mutate(undefined, {
                onSuccess: (r) => (r.found && r.match_id ? go(r.match_id) : setNote(r.reason ?? 'Активный матч не найден')),
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
