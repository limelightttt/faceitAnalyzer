import { ratingTone } from '@/entities/match'
import type { MatchDetail } from '@/entities/player'
import { cn } from '@/shared/lib/cn'
import { fmt, pct } from '@/shared/lib/format'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Table, TBody, TD, TH, THead, TR } from '@/shared/ui'

export function MatchScoreboard({ detail }: { detail: MatchDetail }) {
  const { match } = detail
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      {match.teams.map((team, ti) => {
        const won = match.winner_team_id === team.team_id
        return (
          <Card key={team.team_id}>
            <CardHeader className="flex-row items-start justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <span className="inline-block size-2.5 rounded-full" style={{ background: ti === 0 ? 'var(--series-1)' : 'var(--series-2)' }} />
                  {team.name || `Команда ${ti + 1}`}
                  {ti === detail.team_index && <span className="text-xs font-normal text-muted-foreground">(команда игрока)</span>}
                </CardTitle>
                <CardDescription>
                  {team.first_half !== null && `Половины ${team.first_half} / ${team.second_half}${team.overtime ? ` · OT ${team.overtime}` : ''}`}
                  {team.avg_elo !== null && ` · ср. Elo ${Math.round(team.avg_elo)}`}
                  {team.win_probability !== null && ` · шанс по FACEIT ${pct(team.win_probability)}`}
                </CardDescription>
              </div>
              <div className={cn('text-3xl font-semibold tabular', won ? 'text-good-text' : 'text-muted-foreground')}>{team.score ?? '—'}</div>
            </CardHeader>
            <CardContent className="px-0 pb-2">
              <Table>
                <THead>
                  <TR>
                    <TH className="pl-5">Игрок</TH>
                    <TH className="text-right">K</TH>
                    <TH className="text-right">D</TH>
                    <TH className="text-right">A</TH>
                    <TH className="text-right">ADR</TH>
                    <TH className="text-right">HS%</TH>
                    <TH className="text-right">Entry</TH>
                    <TH className="pr-5 text-right">Rating</TH>
                  </TR>
                </THead>
                <TBody>
                  {[...team.players]
                    .sort((a, b) => (b.stats?.rating ?? 0) - (a.stats?.rating ?? 0))
                    .map((p) => (
                      <TR key={p.player_id} className={cn(p.player_id === detail.player_id && 'bg-primary/8')}>
                        <TD className="pl-5 font-medium">
                          {p.nickname}
                          {p.skill_level && <span className="ml-1.5 text-xs text-subtle-foreground">lvl {p.skill_level}</span>}
                        </TD>
                        <TD className="text-right">{p.stats?.kills ?? '—'}</TD>
                        <TD className="text-right">{p.stats?.deaths ?? '—'}</TD>
                        <TD className="text-right">{p.stats?.assists ?? '—'}</TD>
                        <TD className="text-right">{fmt(p.stats?.adr, 1)}</TD>
                        <TD className="text-right">{p.stats?.hs_pct ?? '—'}</TD>
                        <TD className="text-right text-muted-foreground">{p.stats?.entry_count != null ? `${p.stats.entry_wins}/${p.stats.entry_count}` : '—'}</TD>
                        <TD className={cn('pr-5 text-right', ratingTone(p.stats?.rating))}>{fmt(p.stats?.rating)}</TD>
                      </TR>
                    ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
