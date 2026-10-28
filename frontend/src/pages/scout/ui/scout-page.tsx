import { Link } from 'react-router-dom'

import { useHistory, useSession } from '@/entities/session'
import { ScoutLaunch } from '@/features/scout-launch'
import { dateTime } from '@/shared/lib/format'
import type { CSSProperties } from 'react'

import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, LoadingSkeleton, SkeletonText } from '@/shared/ui'

const STEPS = [
  ['Составы и сила', 'Elo-распределение, форма за 20 матчей, опыт на карте, Elo-ожидание с честной неопределённостью.'],
  ['Угрозы и роли', 'Композитный индекс угрозы внутри лобби, роли из статистики (AWP, entry).'],
  ['Связки', 'Кто играет вместе по истории матчей; подтверждение позициями и разменами из демок.'],
  ['Риск-профили', 'Объяснимые статистические сигналы (новый аккаунт, быстрый рост Elo, выбросы) с альтернативами.'],
  ['Тактика', 'Позиции соперников из разобранных демок — только при достаточной выборке.'],
  ['Проверка', 'Прогноз фиксируется до матча и сверяется с результатом.'],
]

export function ScoutPage() {
  const { data: session } = useSession()
  const hist = useHistory(Boolean(session?.authenticated))
  const scouts = (hist.data ?? []).filter((h) => h.kind === 'scout')
  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl border bg-card p-6 md:p-8">
        <div className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-primary/15 blur-3xl" />
        <div className="relative max-w-3xl space-y-4">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Match Scout</h1>
          <p className="text-sm text-muted-foreground">
            Вставьте ссылку на комнату матча FACEIT — приложение само соберёт данные по всем десяти игрокам и подготовит предматчевый брифинг. Никаких ручных поисков профилей.
          </p>
          <ScoutLaunch size="lg" />
        </div>
      </section>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {STEPS.map(([t, d], i) => (
          <div key={t} className="animate-enter rounded-xl border bg-card p-4" style={{ '--i': i } as CSSProperties}>
            <div className="text-sm font-semibold">{t}</div>
            <div className="mt-1 text-xs text-muted-foreground">{d}</div>
          </div>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Мои разведки</CardTitle>
          <CardDescription>{session?.authenticated ? 'Последние открытые отчёты' : 'Войдите, чтобы сохранять историю разведок и проверять прогнозы'}</CardDescription>
        </CardHeader>
        <CardContent>
          {hist.isPending && session?.authenticated ? (
            <LoadingSkeleton label="Загружаем историю разведок">
              <SkeletonText lines={4} />
            </LoadingSkeleton>
          ) : scouts.length === 0 ? (
            <EmptyState title="Разведок пока нет" className="p-6">
              Вставьте ссылку на комнату выше — отчёт появится здесь.
            </EmptyState>
          ) : (
            <div className="divide-y">
              {scouts.map((s) => (
                <Link key={s.ref + s.at} to={`/scout/${s.ref}`} className="-mx-2 flex items-center justify-between rounded-md px-2 py-2.5 text-sm transition-colors hover:bg-card-2/60 hover:text-primary">
                  <span>{s.label}</span>
                  <span className="text-xs text-muted-foreground">{dateTime(s.at)}</span>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
