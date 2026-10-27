import { Search } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { cn } from '@/shared/lib/cn'
import { Button, Input } from '@/shared/ui'

export function PlayerSearch({ className, size = 'default' }: { className?: string; size?: 'default' | 'lg' }) {
  const [nick, setNick] = useState('')
  const navigate = useNavigate()
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const v = nick.trim()
    if (v) navigate(`/players/${encodeURIComponent(v)}`)
  }
  return (
    <form onSubmit={submit} className={cn('flex w-full gap-2', className)} role="search">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle-foreground" />
        <Input
          value={nick}
          onChange={(e) => setNick(e.target.value)}
          placeholder="Никнейм FACEIT"
          aria-label="Никнейм FACEIT"
          className={cn('pl-9', size === 'lg' && 'h-12 text-base')}
        />
      </div>
      <Button type="submit" size={size === 'lg' ? 'lg' : 'default'} disabled={!nick.trim()}>
        Анализ
      </Button>
    </form>
  )
}
