import { AlertTriangle, ArrowDown, Crosshair, Map as MapIcon, Swords, Users } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { MapChip } from '@/entities/match'
import type { ScoutReport } from '@/entities/scout'
import { cn } from '@/shared/lib/cn'
import { fmt, mapName, pct } from '@/shared/lib/format'
import { Avatar, Badge, Card, Hint } from '@/shared/ui'

import { summarize } from '../model/summary'
import { teamLabel } from './shared'

function Block({ icon: Icon, title, more, children }: { icon: typeof Users; title: string; more: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          <Icon className="size-3.5" /> {title}
        </h3>
        <a href={`#${more}`} className="inline-flex items-center gap-0.5 rounded text-[11px] text-subtle-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
          подробнее <ArrowDown className="size-3" />
        </a>
      </div>
      {children}
    </div>
  )
}

const Quiet = ({ children }: { children: ReactNode }) => <p className="text-xs text-subtle-foreground">{children}</p>
const mapList = (maps: string[]) => maps.map(mapName).join(', ')

/** First screen of a report: chance, who to watch, who plays together, the map. Readable in the minute
 * between "match found" and the veto; every block links to its detailed section below. */
export function ScoutSummary({ r, waitingForMap }: { r: ScoutReport; waitingForMap: boolean }) {
  const s = summarize(r)
  const chance = s.winChance === null ? null : Math.round(s.winChance * 100)
  return (
    <Card className="overflow-hidden border-primary/25">
      <div className="grid gap-6 p-5 lg:grid-cols-[220px_repeat(3,minmax(0,1fr))]">
        <div className="space-y-2 lg:border-r lg:pr-6">
          <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Шанс {r.user_faction ? 'вашей команды' : teamLabel(r, s.side)}</div>
          <div className={cn('text-5xl font-semibold tracking-tight tabular', chance !== null && chance >= 55 && 'text-good-text', chance !== null && chance <= 45 && 'text-critical-text')}>
            {chance === null ? '—' : `${chance}%`}
          </div>
          <Hint content={`${r.comparison.uncertainty} Модель: ${r.comparison.model}.`}>
            <p className="cursor-help text-xs text-muted-foreground underline decoration-dotted underline-offset-4">
              {s.favoured === null ? 'Примерно равные команды' : s.favoured === 'us' ? 'Вы фавориты по Elo' : 'Соперники фавориты по Elo'}
            </p>
          </Hint>
          <p className="text-[11px] text-subtle-foreground tabular">
            Факторы: {s.factors.us} за вас · {s.factors.them} за них
          </p>
        </div>

        <Block icon={Crosshair} title="Главные угрозы" more="threats">
          {s.threats.length === 0 ? (
            <Quiet>Нет данных по соперникам.</Quiet>
          ) : (
            <ol className="space-y-2">
              {s.threats.map((p) => (
                <li key={p.player_id} className="flex items-center gap-2.5">
                  <Avatar src={p.avatar} name={p.nickname} className="size-8 rounded-lg bg-card-2 text-xs font-semibold" />
                  <div className="min-w-0 flex-1">
                    <Link to={`/players/${encodeURIComponent(p.nickname)}`} className="block truncate text-sm font-medium hover:underline">
                      {p.nickname}
                    </Link>
                    <div className="truncate text-[11px] text-muted-foreground tabular">
                      {p.roles[0]?.role && <span className="text-foreground">{p.roles[0].role} · </span>}
                      R {fmt(p.recent.rating ?? null)} · ADR {fmt(p.recent.adr ?? null, 0)} · {p.elo ?? '—'} Elo
                    </div>
                  </div>
                  <span className="text-xs text-subtle-foreground tabular">#{p.threat.rank}</span>
                </li>
              ))}
            </ol>
          )}
        </Block>

        <Block icon={Users} title="Кто с кем играет" more="duos">
          {s.duos.length === 0 ? (
            <Quiet>Устойчивых связок в последних матчах не видно.</Quiet>
          ) : (
            <ul className="space-y-2">
              {s.duos.map((d) => (
                <li key={`${d.a}-${d.b}`} className="text-sm">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium">
                      {d.a_name} + {d.b_name}
                    </span>
                    <Badge variant={d.faction === s.side ? 'outline' : 'brand'}>{d.faction === s.side ? 'ваши' : 'соперники'}</Badge>
                  </div>
                  <div className="text-[11px] text-muted-foreground tabular">
                    {d.category_label} · {d.shared_matches} общих · WR вместе {pct(d.win_rate_together)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Block>

        <Block icon={MapIcon} title="Карта" more="maps">
          {s.map.picked ? (
            <div className="space-y-1.5 text-xs">
              <MapChip map={s.map.name} />
              {(
                [
                  ['Вы', s.map.us],
                  ['Они', s.map.them],
                ] as const
              ).map(([who, t]) => (
                <div key={who} className="text-muted-foreground tabular">
                  <span className="text-foreground">{who}:</span> {t ? `${t.matches} матчей, WR ${pct(t.winRate)}` : 'нет данных'}
                  {t && t.inexperienced.length > 0 && <span className="text-critical-text"> · мало опыта: {t.inexperienced.join(', ')}</span>}
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-1.5 text-xs text-muted-foreground">
              {waitingForMap && (
                <p className="flex items-center gap-1.5 text-foreground" role="status">
                  <span className="motion-essential size-2 animate-pulse rounded-full bg-primary" /> Ждём выбор карты — отчёт обновится сам
                </p>
              )}
              {s.map.theirBest.length > 0 && (
                <p>
                  <span className="text-foreground">Их сильные:</span> {mapList(s.map.theirBest)}
                </p>
              )}
              {s.map.theirWorst.length > 0 && (
                <p>
                  <span className="text-foreground">Их слабые:</span> {mapList(s.map.theirWorst)}
                </p>
              )}
              {s.map.ourBest.length > 0 && (
                <p>
                  <span className="text-foreground">Ваши сильные:</span> {mapList(s.map.ourBest)}
                </p>
              )}
              {!s.map.theirBest.length && !s.map.ourBest.length && <Quiet>Мало матчей на картах, чтобы сравнивать.</Quiet>}
            </div>
          )}
        </Block>
      </div>
      {s.flagged.length > 0 && (
        <a href="#threats" className="flex items-center gap-2 border-t border-warning/30 bg-warning/[0.06] px-5 py-2.5 text-xs hover:bg-warning/10">
          <AlertTriangle className="size-3.5 shrink-0" />
          <span>
            Необычные профили: {s.flagged.map((p) => `${p.nickname} (${p.risk.label})`).join(', ')} — статистический сигнал, не обвинение.
          </span>
        </a>
      )}
      <a href="#briefing" className="flex items-center gap-2 border-t px-5 py-2.5 text-xs text-muted-foreground hover:bg-card-2/40 hover:text-foreground">
        <Swords className="size-3.5 shrink-0" /> Полный брифинг: {r.briefing.length} выводов с доказательствами <ArrowDown className="ml-auto size-3.5" />
      </a>
    </Card>
  )
}
