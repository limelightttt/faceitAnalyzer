import { useMemo, useState } from 'react'

import type { ScoutReport } from '@/entities/scout'
import { useSession, useSettings } from '@/entities/session'
import { cn } from '@/shared/lib/cn'
import { Avatar, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui'
import { MapPool } from '@/widgets/scout'
import { type OpponentMaps, StackMapPool } from '@/widgets/stack-map-pool'

const GROUP_CATEGORIES = new Set(['possible_duo', 'established_cooperation'])

/** Team-level map experience plus the map pool of the group you actually queue with in this match:
 * you, your saved teammates and anyone the history says you play with. Toggle players to compare. */
export function MapsSection({ r }: { r: ScoutReport }) {
  const { data: session } = useSession()
  const settings = useSettings(Boolean(session?.authenticated))
  const team = r.teams[r.user_faction ?? 'faction1']
  const opponents = r.teams[r.user_faction === 'faction2' ? 'faction1' : 'faction2']
  const me = team.players.find((p) => p.nickname.toLowerCase() === session?.game_profile?.nickname.toLowerCase())

  const suggested = useMemo(() => {
    const saved = new Set((settings.data?.teammates ?? []).map((n) => n.toLowerCase()))
    const partners = new Set(
      team.pairs.filter((p) => GROUP_CATEGORIES.has(p.category) && me && (p.a === me.player_id || p.b === me.player_id)).flatMap((p) => [p.a, p.b]),
    )
    return team.players.filter((p) => p === me || saved.has(p.nickname.toLowerCase()) || partners.has(p.player_id)).map((p) => p.nickname)
  }, [team, me, settings.data])
  const [picked, setPicked] = useState<string[] | null>(null)
  const group = picked ?? suggested

  const oppMaps: OpponentMaps = Object.fromEntries(r.map_pool.map((m) => [m.map, { matches: m.them_matches, winRate: m.them_win_rate }]))
  const toggle = (nick: string) => setPicked(group.includes(nick) ? group.filter((n) => n !== nick) : [...group, nick])

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="gap-3">
          <div>
            <CardTitle>Пул карт вашего стака</CardTitle>
            <CardDescription>
              Отметьте, с кем вы в пати: оценка учитывает каждого игрока и матчи, сыгранные вместе. Справа — как эти карты играют {opponents.name}.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Игроки стака">
            {team.players.map((p) => {
              const on = group.includes(p.nickname)
              return (
                <button
                  key={p.player_id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(p.nickname)}
                  className={cn(
                    'pressable inline-flex items-center gap-1.5 rounded-full border py-0.5 pr-2.5 pl-0.5 text-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                    on ? 'border-primary bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-card-2',
                  )}
                >
                  <Avatar src={p.avatar} name={p.nickname} className="size-5 rounded-full bg-card-2 text-[10px]" />
                  {p.nickname}
                  {p === me && <span className="text-subtle-foreground">(вы)</span>}
                </button>
              )
            })}
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-3">
          {group.length ? (
            <StackMapPool players={group} opponents={oppMaps} />
          ) : (
            <p className="px-5 text-xs text-muted-foreground">Выберите хотя бы одного игрока.</p>
          )}
        </CardContent>
      </Card>
      <MapPool r={r} />
    </div>
  )
}
