import { Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { MapChip, ratingTone, ResultPill } from '@/entities/match'
import type { MatchRow } from '@/entities/player'
import { cn } from '@/shared/lib/cn'
import { dateTime, fmt, mapName } from '@/shared/lib/format'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Hint, Select, Table, TBody, TD, TH, THead, TR } from '@/shared/ui'

export function MatchesTable({
  matches,
  nickname,
  search,
  limit,
  title = 'История матчей',
}: {
  matches: MatchRow[]
  nickname: string
  search: string
  limit?: number
  title?: string
}) {
  const navigate = useNavigate()
  const [map, setMap] = useState('all')
  const [result, setResult] = useState('all')
  const [party, setParty] = useState('all')
  const maps = useMemo(() => [...new Set(matches.map((m) => m.map).filter(Boolean))] as string[], [matches])
  const rows = matches
    .filter((m) => map === 'all' || m.map === map)
    .filter((m) => result === 'all' || (result === 'win' ? m.won === true : m.won === false))
    .filter((m) => party === 'all' || (party === 'party' ? m.party_size > 1 : m.party_size === 1))
    .slice(0, limit)
  const showElo = matches.some((m) => m.team_avg_elo !== null)

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>Новые сверху · клик по строке — подробности матча</CardDescription>
        </div>
        {limit === undefined && (
          <div className="flex flex-wrap gap-2">
            <Select label="Карта" value={map} onChange={setMap} options={[{ value: 'all', label: 'Все карты' }, ...maps.map((m) => ({ value: m, label: mapName(m) }))]} />
            <Select label="Результат" value={result} onChange={setResult} options={[{ value: 'all', label: 'Все результаты' }, { value: 'win', label: 'Победы' }, { value: 'loss', label: 'Поражения' }]} />
            <Select label="Пати" value={party} onChange={setParty} options={[{ value: 'all', label: 'Соло и пати' }, { value: 'solo', label: 'Соло' }, { value: 'party', label: 'Пати (оценка)' }]} />
          </div>
        )}
      </CardHeader>
      <CardContent className="px-0 pb-2">
        {rows.length === 0 ? (
          <div className="px-5 pb-3">
            <EmptyState title="Нет матчей под фильтр" />
          </div>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH className="pl-5" />
                <TH>Карта</TH>
                <TH>Счёт</TH>
                <TH>K / D / A</TH>
                <TH className="text-right">ADR</TH>
                <TH className="text-right">HS%</TH>
                <TH className="text-right">Rating</TH>
                {showElo && <TH className="text-right">Elo ком. / соп.</TH>}
                <TH>Пати</TH>
                <TH className="pr-5">Дата</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((m) => (
                <TR
                  key={m.match_id}
                  tabIndex={0}
                  className="cursor-pointer hover:bg-card-2 focus-visible:bg-card-2 focus-visible:outline-none"
                  onClick={() => navigate(`/players/${encodeURIComponent(nickname)}/matches/${m.match_id}${search}`)}
                  onKeyDown={(e) => e.key === 'Enter' && navigate(`/players/${encodeURIComponent(nickname)}/matches/${m.match_id}${search}`)}
                >
                  <TD className="pl-5">
                    <ResultPill won={m.won} />
                  </TD>
                  <TD>
                    <MapChip map={m.map} />
                  </TD>
                  <TD className="font-medium">{m.score_for !== null ? `${m.score_for}:${m.score_against}` : '—'}</TD>
                  <TD>{m.has_stats ? `${m.kills} / ${m.deaths} / ${m.assists}` : '—'}</TD>
                  <TD className="text-right">{fmt(m.adr, 1)}</TD>
                  <TD className="text-right">{m.hs_pct ?? '—'}</TD>
                  <TD className={cn('text-right', ratingTone(m.rating))}>{fmt(m.rating)}</TD>
                  {showElo && (
                    <TD className="text-right text-muted-foreground">
                      {m.team_avg_elo ?? '—'} / {m.opp_avg_elo ?? '—'}
                    </TD>
                  )}
                  <TD>
                    {m.party_size > 1 ? (
                      <Hint content={`Вероятные напарники (эвристика): ${m.party_members.join(', ')}`}>
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Users className="size-3.5" /> {m.party_size}
                        </span>
                      </Hint>
                    ) : (
                      <span className="text-xs text-subtle-foreground">соло</span>
                    )}
                  </TD>
                  <TD className="pr-5 text-xs text-muted-foreground">{dateTime(m.started_at)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
