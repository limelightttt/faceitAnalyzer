import { useState } from 'react'

import { ratingTone } from '@/entities/match'
import type { DemoAnalysis, DemoPlayer } from '@/entities/demo'
import { cn } from '@/shared/lib/cn'
import { fmt } from '@/shared/lib/format'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Hint, Table, TBody, TD, TH, THead, TR } from '@/shared/ui'

type Key = 'rating' | 'kills' | 'adr' | 'kast' | 'opening_kills' | 'trade_kills' | 'utility_damage' | 'enemies_flashed'

const COLS: { key: Key; label: string; hint: string }[] = [
  { key: 'kills', label: 'K-D-A', hint: 'Убийства-смерти-ассисты' },
  { key: 'adr', label: 'ADR', hint: 'Средний урон за раунд' },
  { key: 'kast', label: 'KAST', hint: 'Раунды с K/A/S/T' },
  { key: 'opening_kills', label: 'Open', hint: 'Opening kills – deaths' },
  { key: 'trade_kills', label: 'Trade', hint: 'Трейд-киллы / разменянные смерти' },
  { key: 'utility_damage', label: 'Util', hint: 'Урон гранатами' },
  { key: 'enemies_flashed', label: 'Flash', hint: 'Ослеплено врагов / флешек брошено' },
  { key: 'rating', label: 'Rating', hint: 'HLTV Rating 1.0' },
]

export function DemoScoreboard({
  data,
  focus,
  onFocus,
}: {
  data: DemoAnalysis
  focus: string | null
  onFocus: (steamid: string) => void
}) {
  const [sort, setSort] = useState<Key>('rating')
  return (
    <Card>
      <CardHeader>
        <CardTitle>Скорборд</CardTitle>
        <CardDescription>Клик по игроку — выбрать фокус для персональных выводов · сортировка по заголовку</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 px-0 pb-2">
        {data.teams.map((team, ti) => {
          const players = data.players.filter((p) => p.team === team.id).sort((a, b) => (b[sort] as number) - (a[sort] as number))
          return (
            <Table key={team.id} className="min-w-[760px] table-fixed">
              <THead>
                <TR>
                  <TH className="w-[30%] pl-5">
                    <span className="flex items-center gap-2 truncate text-foreground">
                      <span className="inline-block size-2.5 rounded-full" style={{ background: ti === 0 ? 'var(--series-1)' : 'var(--series-2)' }} />
                      {team.name} · {team.score} · старт за {team.start_side}
                    </span>
                  </TH>
                  {COLS.map((c) => (
                    <TH key={c.key} className="text-right">
                      <Hint content={c.hint}>
                        <button type="button" onClick={() => setSort(c.key)} className={cn('hover:text-foreground', sort === c.key && 'text-foreground underline underline-offset-4')}>
                          {c.label}
                        </button>
                      </Hint>
                    </TH>
                  ))}
                  <TH className="w-[9%] pr-5" />
                </TR>
              </THead>
              <TBody>
                {players.map((p: DemoPlayer) => (
                  <TR
                    key={p.steamid}
                    tabIndex={0}
                    onClick={() => onFocus(p.steamid)}
                    onKeyDown={(e) => e.key === 'Enter' && onFocus(p.steamid)}
                    className={cn('cursor-pointer hover:bg-card-2', focus === p.steamid && 'bg-primary/10')}
                  >
                    <TD className="max-w-48 truncate pl-5 font-medium">{p.name}</TD>
                    <TD className="text-right">
                      {p.kills}-{p.deaths}-{p.assists}
                    </TD>
                    <TD className="text-right">{fmt(p.adr, 1)}</TD>
                    <TD className="text-right">{p.kast.toFixed(0)}%</TD>
                    <TD className="text-right">
                      {p.opening_kills}-{p.opening_deaths}
                    </TD>
                    <TD className="text-right">
                      {p.trade_kills}/{p.traded_deaths}
                    </TD>
                    <TD className="text-right">{p.utility_damage}</TD>
                    <TD className="text-right">
                      {p.enemies_flashed}/{p.flashes}
                    </TD>
                    <TD className={cn('text-right', ratingTone(p.rating))}>{fmt(p.rating)}</TD>
                    <TD className="pr-5 text-right text-xs text-subtle-foreground">
                      {p.multi['5'] ? 'ACE ' : ''}
                      {p.multi['4'] ? `4K×${p.multi['4']} ` : ''}
                      {p.multi['3'] ? `3K×${p.multi['3']}` : ''}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )
        })}
      </CardContent>
    </Card>
  )
}
