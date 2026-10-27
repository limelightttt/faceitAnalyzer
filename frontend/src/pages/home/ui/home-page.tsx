import { Activity, ArrowRight, FileVideo, GraduationCap, Radar, ShieldQuestion, Target } from 'lucide-react'
import { Link } from 'react-router-dom'

import { useCoach } from '@/entities/coach'
import { useHealth, useOverview } from '@/entities/player'
import { usePredictionMetrics } from '@/entities/prediction'
import { useHistory, useSession } from '@/entities/session'
import { LoginButtons } from '@/features/auth'
import { PlayerSearch } from '@/features/player-search'
import { ScoutLaunch } from '@/features/scout-launch'
import { dateTime, fmt, pct } from '@/shared/lib/format'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, ErrorState, Progress, Skeleton, StatTile } from '@/shared/ui'
import { DemoList } from '@/widgets/demo-list'
import { PlayerKpis } from '@/widgets/player-kpis'

const FEATURES = [
  { icon: Radar, title: 'BEFORE — разведка', text: 'Ссылка на комнату → брифинг по обеим командам, угрозы, связки, риск-профили.' },
  { icon: ShieldQuestion, title: 'PLAY — что знать', text: 'Тактика соперников из разобранных демок — только при достаточной выборке.' },
  { icon: Activity, title: 'AFTER — что произошло', text: 'Прогноз фиксируется до матча и сверяется с результатом.' },
  { icon: GraduationCap, title: 'IMPROVE — как расти', text: 'Цели по измеренным слабым местам, недельные сводки, ошибки из демок.' },
]

function HealthNote() {
  const h = useHealth()
  if (!h.data) return null
  if (!h.data.api_key_configured)
    return <div className="rounded-lg border border-critical/40 bg-critical/5 px-3 py-2 text-xs">FACEIT Data API не настроен (FACEIT_API_KEY). Статистика и разведка недоступны, работают только демки.</div>
  return null
}

function Dashboard({ nickname }: { nickname: string }) {
  const ov = useOverview(nickname, 100)
  const coach = useCoach(true)
  const pm = usePredictionMetrics(true)
  const hist = useHistory(true)
  return (
    <div className="space-y-4">
      <section className="flex flex-col gap-4 rounded-2xl border bg-card p-5 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-xs text-muted-foreground">Ваш профиль</div>
          <Link to={`/players/${encodeURIComponent(nickname)}`} className="text-2xl font-semibold tracking-tight hover:underline">
            {nickname}
          </Link>
          {ov.data && (
            <div className="text-xs text-muted-foreground tabular">
              Elo {ov.data.profile.elo ?? '—'} · уровень {ov.data.profile.skill_level ?? '—'} · {ov.data.quality.matches_loaded} матчей в выборке
            </div>
          )}
        </div>
        <ScoutLaunch className="w-full md:max-w-xl" />
      </section>
      {ov.isLoading ? <Skeleton className="h-28" /> : ov.error ? <ErrorState error={ov.error} /> : ov.data && <PlayerKpis data={ov.data} />}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="size-4" /> Цели
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {coach.data?.goals.length ? (
              coach.data.goals.slice(0, 3).map((g) => (
                <div key={g.id}>
                  <div className="flex justify-between text-xs">
                    <span>{g.label}</span>
                    <span className="text-muted-foreground">{g.progress.n_after} новых</span>
                  </div>
                  <Progress value={Math.round(Math.max(0, Math.min(1, g.progress.fraction ?? 0)) * 100)} className="mt-1" />
                </div>
              ))
            ) : (
              <EmptyState title="Целей нет">
                <Link to="/coach" className="underline">
                  Открыть коуча
                </Link>
              </EmptyState>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Качество прогнозов</CardTitle>
            <CardDescription>Проверено {pm.data?.scored ?? 0} · нужно 30+ для выводов</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            <StatTile label="Brier" value={pm.data?.brier ?? '—'} hint="монетка 0.25" className="p-3" />
            <StatTile label="Фаворит угадан" value={pct(pm.data?.favourite_accuracy ?? null)} className="p-3" />
            <Link to="/predictions" className="col-span-2 text-xs text-muted-foreground hover:text-foreground">
              Все прогнозы <ArrowRight className="inline size-3" />
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>История анализов</CardTitle>
          </CardHeader>
          <CardContent>
            {!hist.data?.length ? (
              <EmptyState title="Пока пусто" />
            ) : (
              <div className="divide-y text-sm">
                {hist.data.slice(0, 6).map((h) => (
                  <Link
                    key={h.kind + h.ref + h.at}
                    to={h.kind === 'scout' ? `/scout/${h.ref}` : h.kind === 'demo' ? `/demos/${h.ref}` : `/players/${encodeURIComponent(h.ref)}`}
                    className="flex justify-between gap-2 py-2 hover:text-primary"
                  >
                    <span className="truncate">
                      <span className="mr-1.5 text-[10px] text-subtle-foreground uppercase">{h.kind}</span>
                      {h.label}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{dateTime(h.at)}</span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      {coach.data && coach.data.weekly[0] && (
        <div className="text-xs text-muted-foreground">
          Эта неделя ({coach.data.weekly[0].week}): {coach.data.weekly[0].matches} матчей, WR {pct(coach.data.weekly[0].win_rate)}, Rating {fmt(coach.data.weekly[0].rating)}.
        </div>
      )}
      <DemoList limit={5} />
    </div>
  )
}

export function HomePage() {
  const { data: session, isLoading } = useSession()
  if (isLoading) return <Skeleton className="h-64" />
  if (session?.authenticated && session.game_profile)
    return (
      <div className="space-y-4">
        <HealthNote />
        <Dashboard nickname={session.game_profile.nickname} />
      </div>
    )
  return (
    <div className="space-y-8">
      <HealthNote />
      <section className="relative overflow-hidden rounded-2xl border bg-card p-6 md:p-10">
        <div className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-primary/15 blur-3xl" />
        <div className="relative max-w-2xl space-y-5">
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">FACEIT Intelligence</h1>
          <p className="text-muted-foreground">
            Разведка перед матчем, разбор после, рост на дистанции. Только реальные данные FACEIT и ваших демок — с явной пометкой, где факт, где оценка, а где гипотеза.
          </p>
          {session?.authenticated && !session.game_profile ? (
            <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
              Вы вошли, но FACEIT-профиль не определён. Привяжите FACEIT или Steam с привязанным FACEIT в <Link to="/settings" className="underline">настройках</Link>.
            </div>
          ) : (
            <LoginButtons returnTo="/" size="lg" />
          )}
          <ScoutLaunch />
          <PlayerSearch />
        </div>
      </section>
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {FEATURES.map((f) => (
          <div key={f.title} className="rounded-xl border bg-card p-4">
            <f.icon className="size-5 text-primary" />
            <div className="mt-3 text-sm font-semibold">{f.title}</div>
            <div className="mt-1 text-xs text-muted-foreground">{f.text}</div>
          </div>
        ))}
      </section>
      <DemoList limit={5} />
      <div className="flex justify-center">
        <Link to="/demos" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <FileVideo className="size-4" /> Разобрать свою демку
        </Link>
      </div>
    </div>
  )
}
