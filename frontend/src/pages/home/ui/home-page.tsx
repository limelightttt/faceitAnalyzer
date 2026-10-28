import { Activity, ArrowRight, FileVideo, GraduationCap, Radar, ShieldQuestion, Target } from 'lucide-react'
import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'

import { useCoach } from '@/entities/coach'
import { useOverview } from '@/entities/player'
import { usePredictionMetrics } from '@/entities/prediction'
import { useHistory, useSession } from '@/entities/session'
import { LoginButtons } from '@/features/auth'
import { PlayerSearch } from '@/features/player-search'
import { ScoutLaunch } from '@/features/scout-launch'
import { dateTime, fmt, pct } from '@/shared/lib/format'
import { AsyncView, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, LoadingSkeleton, Progress, Skeleton, SkeletonText, SkeletonTiles, StatTile } from '@/shared/ui'
import { DemoList } from '@/widgets/demo-list'
import { PlayerKpis } from '@/widgets/player-kpis'
import { ServiceNotes } from '@/widgets/system-status'

const FEATURES = [
  { icon: Radar, title: 'BEFORE — разведка', text: 'Ссылка на комнату → брифинг по обеим командам, угрозы, связки, риск-профили.' },
  { icon: ShieldQuestion, title: 'PLAY — что знать', text: 'Тактика соперников из разобранных демок — только при достаточной выборке.' },
  { icon: Activity, title: 'AFTER — что произошло', text: 'Прогноз фиксируется до матча и сверяется с результатом.' },
  { icon: GraduationCap, title: 'IMPROVE — как расти', text: 'Цели по измеренным слабым местам, недельные сводки, ошибки из демок.' },
]

function Dashboard({ nickname }: { nickname: string }) {
  const ov = useOverview(nickname, 50)
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
          {ov.data ? (
            <div className="animate-fade-in text-xs text-muted-foreground tabular">
              Elo {ov.data.profile.elo ?? '—'} · уровень {ov.data.profile.skill_level ?? '—'} · {ov.data.quality.matches_loaded} матчей в выборке
            </div>
          ) : (
            ov.isPending && <Skeleton className="mt-1.5 h-3 w-56" />
          )}
        </div>
        <div className="w-full space-y-2 md:max-w-xl">
          <ScoutLaunch />
          <PlayerSearch />
        </div>
      </section>
      <AsyncView query={ov} notFound="Ваш FACEIT-профиль не найден" skeleton={<LoadingSkeleton label="Загружаем вашу статистику"><SkeletonTiles count={6} className="md:grid-cols-3 xl:grid-cols-6" /></LoadingSkeleton>}>
        {(d) => <PlayerKpis data={d} />}
      </AsyncView>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="size-4" /> Цели
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {coach.isPending ? (
              <LoadingSkeleton label="Загружаем цели">
                <SkeletonText lines={4} />
              </LoadingSkeleton>
            ) : coach.data?.goals.length ? (
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
              <EmptyState
                title={coach.error ? 'Цели сейчас недоступны' : 'Целей пока нет'}
                className="p-5"
                action={
                  <Link to="/coach" className="text-xs underline underline-offset-4 hover:text-foreground">
                    Открыть коуча
                  </Link>
                }
              />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Качество прогнозов</CardTitle>
            <CardDescription>{pm.data ? `Проверено ${pm.data.scored} · нужно 30+ для выводов` : 'Нужно 30+ проверенных прогнозов для выводов'}</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            {pm.isPending ? (
              <SkeletonTiles count={2} className="col-span-2 grid-cols-2 md:grid-cols-2 [&>*]:p-3" />
            ) : (
              <>
                <StatTile label="Brier" value={pm.data?.brier ?? '—'} hint="монетка 0.25" className="p-3" />
                <StatTile label="Фаворит угадан" value={pct(pm.data?.favourite_accuracy ?? null)} className="p-3" />
              </>
            )}
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
            {hist.isPending ? (
              <LoadingSkeleton label="Загружаем историю">
                <SkeletonText lines={5} />
              </LoadingSkeleton>
            ) : !hist.data?.length ? (
              <EmptyState title="Пока пусто" className="p-5">
                Здесь появятся открытые игроки, разведки и демки.
              </EmptyState>
            ) : (
              <div className="divide-y text-sm">
                {hist.data.slice(0, 6).map((h) => (
                  <Link
                    key={h.kind + h.ref + h.at}
                    to={h.kind === 'scout' ? `/scout/${h.ref}` : h.kind === 'demo' ? `/demos/${h.ref}` : `/players/${encodeURIComponent(h.ref)}`}
                    className="-mx-2 flex justify-between gap-2 rounded-md px-2 py-2 transition-colors hover:bg-card-2/60 hover:text-primary"
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
  const { data: session } = useSession()
  if (session?.authenticated && session.game_profile)
    return (
      <div className="space-y-4">
        <ServiceNotes />
        <Dashboard nickname={session.game_profile.nickname} />
      </div>
    )
  return (
    <div className="space-y-8">
      <ServiceNotes />
      <section className="relative overflow-hidden rounded-2xl border bg-card p-6 md:p-10">
        <div className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-primary/15 blur-3xl" />
        <div className="relative max-w-2xl space-y-5">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">FACEIT Intelligence</h1>
            <div className="mt-1 text-sm text-subtle-foreground">by limelightttt</div>
          </div>
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
        {FEATURES.map((f, i) => (
          <div key={f.title} className="animate-enter rounded-xl border bg-card p-4" style={{ '--i': i + 1 } as CSSProperties}>
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
