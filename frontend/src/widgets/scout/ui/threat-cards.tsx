import { AlertTriangle, ChevronDown, MapPin } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import type { Faction, ScoutJob, ScoutPlayer } from '@/entities/scout'
import { FeedbackButtons } from '@/features/feedback'
import { cn } from '@/shared/lib/cn'
import { fmt, mapName, pct } from '@/shared/lib/format'
import { Avatar, Badge, Card, CardContent, CardHeader, CardTitle, Hint } from '@/shared/ui'
import { SkillLevel } from '@/widgets/player-header'

import { AREA_LABEL, FACTION_COLOR, LEVEL_LABEL, orderedFactions, teamLabel } from './shared'

function Form({ p }: { p: ScoutPlayer }) {
  return (
    <div className="flex gap-0.5" role="img" aria-label="Последние результаты">
      {p.form
        .slice(0, 15)
        .reverse()
        .map((m, i) => (
          <Hint key={i} content={`${mapName(m.map)} · ${m.won ? 'победа' : 'поражение'} · Rating ${fmt(m.rating)}`}>
            <span className={cn('h-4 w-1.5 rounded-[2px]', m.won ? 'bg-good/80' : m.won === false ? 'bg-critical/70' : 'bg-card-2')} />
          </Hint>
        ))}
    </div>
  )
}

function RiskPanel({ p, matchId, predictionId }: { p: ScoutPlayer; matchId: string; predictionId?: number }) {
  const r = p.risk
  return (
    <div className="mt-3 space-y-2 rounded-lg border border-warning/40 bg-warning/5 p-3 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{r.label}</span>
        <span className="text-subtle-foreground">score {r.score} · доверие {r.confidence === 'medium' ? 'среднее' : 'низкое'}</span>
      </div>
      <table className="w-full tabular">
        <thead>
          <tr className="text-left text-subtle-foreground">
            <th className="py-1 font-normal">Сигнал</th>
            <th className="py-1 font-normal">Детали</th>
            <th className="py-1 text-right font-normal">Сила</th>
          </tr>
        </thead>
        <tbody>
          {r.signals.map((s) => (
            <tr key={s.key} className="border-t border-warning/20 align-top">
              <td className="py-1 pr-2">{s.label}</td>
              <td className="py-1 pr-2 text-muted-foreground">
                {s.detail}
                <div className="text-subtle-foreground">норма: {typeof s.reference === 'object' ? JSON.stringify(s.reference) : String(s.reference)}</div>
              </td>
              <td className="py-1 text-right">{s.strength.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="text-muted-foreground">
        Данные: {r.data.lifetime_matches ?? '—'} матчей CS2, {r.data.recent_matches} последних в выборке, аккаунту {r.data.account_age_days ?? '—'} дн.
      </div>
      {r.alternatives.length > 0 && (
        <div>
          <div className="text-subtle-foreground">Альтернативные объяснения:</div>
          <ul className="list-disc pl-4 text-muted-foreground">
            {r.alternatives.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex items-center justify-between gap-2 text-[11px] text-subtle-foreground">
        <span>{r.disclaimer}</span>
        <FeedbackButtons target={`risk:${p.player_id}`} matchId={matchId} predictionId={predictionId} />
      </div>
    </div>
  )
}

function Tactical({ p, map }: { p: ScoutPlayer; map: string | null }) {
  const prof = map ? p.tactical?.maps[map] : undefined
  if (!p.tactical?.observed || !prof) {
    return <div className="text-[11px] text-subtle-foreground">Позиции: нет разобранных демок{map ? ` на ${mapName(map)}` : ''}</div>
  }
  return (
    <div className="space-y-1 text-[11px]">
      {(['CT', 'T'] as const).map((side) => {
        const sp = prof.sides[side]
        if (!sp) return null
        const pa = sp.primary_area
        return (
          <div key={side} className="flex items-center gap-1.5">
            <MapPin className="size-3 text-subtle-foreground" />
            <span className="w-5 font-medium">{side}</span>
            {pa.level === 'insufficient' ? (
              <span className="text-subtle-foreground">недостаточно данных ({sp.rounds} р.)</span>
            ) : (
              <Hint content={`Доля ${pct(pa.share)} из ${sp.rounds} раундов, 95% CI ${pct(pa.ci95[0])}–${pct(pa.ci95[1])}. Чаще всего: ${sp.top_places.map((x) => x.place).join(', ')}`}>
                <span>
                  обычно <b>{AREA_LABEL[pa.area] ?? pa.area}</b> ({pct(pa.share)}, {sp.rounds} р.) · {LEVEL_LABEL[pa.level]}
                </span>
              </Hint>
            )}
          </div>
        )
      })}
      <div className="text-subtle-foreground">демок: {prof.demos}</div>
    </div>
  )
}

function PlayerCard({ p, faction, job }: { p: ScoutPlayer; faction: Faction; job: ScoutJob }) {
  const [open, setOpen] = useState(false)
  const r = job.report!
  const rec = p.recent
  const flagged = Boolean(p.risk.classification)
  return (
    <div className={cn('rounded-xl border bg-card p-4', flagged && 'border-warning/50')}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative">
            <Avatar src={p.avatar} name={p.nickname} className="size-10 rounded-lg bg-card-2 text-sm font-semibold" />
            <span className="absolute -bottom-1 -left-1 size-3 rounded-full border-2 border-card" style={{ background: FACTION_COLOR[faction] }} />
          </div>
          <div className="min-w-0">
            <Link to={`/players/${encodeURIComponent(p.nickname)}`} className="block truncate font-medium hover:underline">
              {p.nickname}
            </Link>
            <div className="flex items-center gap-2 text-xs text-muted-foreground tabular">
              <SkillLevel level={p.level} /> {p.elo ?? '—'} Elo
            </div>
          </div>
        </div>
        <Hint content={`Композитный индекс угрозы внутри лобби: Elo ${p.threat.components.elo}, рейтинг ${p.threat.components.rating}, ADR ${p.threat.components.adr}, карта ${p.threat.components.map} (z-оценки)`}>
          <div className="text-right">
            <div className={cn('text-lg font-semibold tabular', p.threat.rank <= 2 && 'text-primary')}>#{p.threat.rank}</div>
            <div className="text-[10px] text-subtle-foreground">угроза</div>
          </div>
        </Hint>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs tabular">
        <div>
          <div className="font-semibold">{fmt(rec.rating)}</div>
          <div className="text-subtle-foreground">Rating</div>
        </div>
        <div>
          <div className="font-semibold">{fmt(rec.kd)}</div>
          <div className="text-subtle-foreground">K/D</div>
        </div>
        <div>
          <div className="font-semibold">{fmt(rec.adr, 0)}</div>
          <div className="text-subtle-foreground">ADR</div>
        </div>
        <div>
          <div className="font-semibold">{pct(rec.win_rate ?? null)}</div>
          <div className="text-subtle-foreground">WR · {rec.n}</div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <Form p={p} />
        {r.map && p.map_segment && (
          <span className="text-[11px] text-muted-foreground tabular">
            {mapName(r.map)}: {p.map_segment.matches ?? 0} м · {pct(p.map_segment.win_rate)}
          </span>
        )}
      </div>
      {(p.roles.length > 0 || flagged || p.errors.length > 0) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {p.roles.map((ro) => (
            <Hint key={ro.role} content={`${ro.evidence} (роль выведена из статистики, не из позиций)`}>
              <span>
                <Badge>{ro.role}</Badge>
              </span>
            </Hint>
          ))}
          {flagged && (
            <button type="button" onClick={() => setOpen(!open)}>
              <Badge variant="warn">
                <AlertTriangle /> {p.risk.label} <ChevronDown className={cn('transition-transform', open && 'rotate-180')} />
              </Badge>
            </button>
          )}
          {p.errors.length > 0 && (
            <Hint content={p.errors.join('; ')}>
              <span>
                <Badge variant="outline">неполные данные</Badge>
              </span>
            </Hint>
          )}
        </div>
      )}
      {flagged && open && <RiskPanel p={p} matchId={r.match_id} predictionId={job.prediction?.id} />}
      <div className="mt-3 border-t pt-2">
        <Tactical p={p} map={r.map} />
      </div>
    </div>
  )
}

export function ThreatCards({ job }: { job: ScoutJob }) {
  const r = job.report!
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      {orderedFactions(r).map((f) => {
        const t = r.teams[f]
        const players = [...t.players].sort((a, b) => a.threat.rank - b.threat.rank)
        return (
          <Card key={f}>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <span className="inline-block size-2.5 rounded-full" style={{ background: FACTION_COLOR[f] }} /> {teamLabel(r, f)}
              </CardTitle>
              <span className="text-xs text-muted-foreground">
                форма: Rating {fmt(t.summary.recent_rating)} · WR {pct(t.summary.recent_win_rate)}
              </span>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {players.map((p) => (
                <PlayerCard key={p.player_id} p={p} faction={f} job={job} />
              ))}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
