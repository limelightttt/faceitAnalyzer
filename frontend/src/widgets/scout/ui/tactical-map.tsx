import { useMemo, useState } from 'react'

import { type Faction, type ScoutReport, useMapGeometry } from '@/entities/scout'
import { mapName } from '@/shared/lib/format'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, LoadingSkeleton, Select, Skeleton } from '@/shared/ui'

import { AREA_LABEL, LEVEL_LABEL, orderedFactions, teamLabel } from './shared'

const PLAYER_COLORS = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)', '#e87ba4']

export function TacticalMap({ r }: { r: ScoutReport }) {
  const [, them] = orderedFactions(r)
  const [team, setTeam] = useState<Faction>(them)
  const [side, setSide] = useState<'CT' | 'T'>('CT')
  const [phase, setPhase] = useState<'early' | 'mid'>('early')
  const players = r.teams[team].players.filter((p) => p.steam_id)
  const ids = players.map((p) => p.steam_id!) as string[]
  const geo = useMapGeometry(r.map, ids)
  const colorOf = useMemo(() => Object.fromEntries(players.map((p, i) => [p.steam_id!, PLAYER_COLORS[i % 5]])), [players])

  if (!r.map) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Тактическая карта</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState title="Карта ещё не выбрана">Позиционный анализ появится после выбора карты в комнате матча.</EmptyState>
        </CardContent>
      </Card>
    )
  }
  const pts = (geo.data?.points ?? []).filter((p) => p.side === side && p.kind === 'position' && p.phase === phase)
  const observed = players.filter((p) => p.tactical?.observed && p.tactical.maps[r.map!])
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>Тактическая карта · {mapName(r.map)}</CardTitle>
          <CardDescription>
            Только реальные позиции из разобранных вами демок (через {phase === 'early' ? '12' : '28'} с после freeze time). Нет демок — нет точек: позиции не придумываются.
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select label="Команда" value={team} onChange={(v) => setTeam(v as Faction)} options={orderedFactions(r).map((f) => ({ value: f, label: teamLabel(r, f) }))} />
          <Select label="Сторона" value={side} onChange={(v) => setSide(v as 'CT' | 'T')} options={[{ value: 'CT', label: 'CT' }, { value: 'T', label: 'T' }]} />
          <Select label="Фаза" value={phase} onChange={(v) => setPhase(v as 'early' | 'mid')} options={[{ value: 'early', label: 'Расстановка' }, { value: 'mid', label: 'Середина раунда' }]} />
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
        {geo.isLoading ? (
          <LoadingSkeleton label="Загружаем позиции на карте">
            <Skeleton className="aspect-square w-full rounded-lg" />
          </LoadingSkeleton>
        ) : observed.length === 0 ? (
          <EmptyState title={`Нет позиционных данных об этой команде на ${mapName(r.map)}`}>
            Загрузите демки прошлых матчей этих игроков в разделе «Демки» — профили позиций накапливаются автоматически и становятся точнее с каждой демкой.
          </EmptyState>
        ) : (
          <div className="relative aspect-square w-full overflow-hidden rounded-lg border bg-background">
            {geo.data?.radar_available && <img src={`/api/maps/${r.map}/radar.png`} alt="" className="absolute inset-0 size-full object-contain opacity-70" />}
            <svg viewBox="0 0 1024 1024" className="absolute inset-0 size-full" role="img" aria-label="Позиции игроков на карте">
              {!geo.data?.radar_available &&
                geo.data?.centroids.map((c) => (
                  <g key={c.place}>
                    <circle cx={c.x} cy={c.y} r={34} fill="var(--card-2)" opacity={0.7} />
                    <text x={c.x} y={c.y + 4} textAnchor="middle" fontSize={15} fill="var(--subtle-foreground)">
                      {c.place}
                    </text>
                  </g>
                ))}
              {pts.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={9} fill={colorOf[p.steam_id] ?? 'var(--subtle-foreground)'} stroke="var(--card)" strokeWidth={3} opacity={0.85}>
                  <title>{`${players.find((x) => x.steam_id === p.steam_id)?.nickname ?? ''} · ${p.place ?? ''}`}</title>
                </circle>
              ))}
            </svg>
            {!geo.data?.radar_available && (
              <div className="absolute bottom-2 left-2 rounded bg-card/80 px-2 py-1 text-[10px] text-subtle-foreground">схема по наблюдённым координатам (радар не загружен)</div>
            )}
          </div>
        )}
        <div className="space-y-2 text-xs">
          {players.map((p) => {
            const sp = p.tactical?.maps[r.map!]?.sides[side]
            return (
              <div key={p.player_id} className="rounded-lg border p-2">
                <div className="flex items-center gap-2 font-medium">
                  <span className="inline-block size-2.5 rounded-full" style={{ background: colorOf[p.steam_id!] }} />
                  {p.nickname}
                </div>
                {!sp ? (
                  <div className="mt-0.5 text-subtle-foreground">нет данных за {side}</div>
                ) : (
                  <div className="mt-0.5 text-muted-foreground">
                    {sp.primary_area.level === 'insufficient' ? (
                      <>недостаточно данных ({sp.rounds} р.)</>
                    ) : (
                      <>
                        {AREA_LABEL[sp.primary_area.area]} · {Math.round(sp.primary_area.share * 100)}% из {sp.rounds} р. · {LEVEL_LABEL[sp.primary_area.level]}
                      </>
                    )}
                    <div className="text-subtle-foreground">
                      opening: {sp.openings.wins}–{sp.openings.losses}
                      {Object.entries(sp.duels_by_area)
                        .filter(([, d]) => d.level === 'ok')
                        .map(([a, d]) => ` · ${a}: ${d.wins}/${d.wins + d.losses}`)
                        .join('')}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
          <p className="text-[11px] text-subtle-foreground">
            Уровни: «предварительно» — 8–19 раундов, «устойчивый паттерн» — от 20; нижняя граница 95% CI доли зоны ≥ 35%.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
