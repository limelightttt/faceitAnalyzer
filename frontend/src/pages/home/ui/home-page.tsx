import { Activity, ArrowRight, FileVideo, FlaskConical, ShieldQuestion, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'

import { SourceBadge, useDatasets, useHealth } from '@/entities/player'
import { PlayerSearch } from '@/features/player-search'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui'
import { DemoList } from '@/widgets/demo-list'

const FEATURES = [
  { icon: Activity, title: 'Статистика и форма', text: 'Win rate с доверительными интервалами, Rating 1.0, карты, тренды, лучшие и худшие игры.' },
  { icon: FileVideo, title: 'Разбор демок', text: 'Парсинг .dem: раунды, KAST, ADR, opening, трейды, клатчи, утилита, экономика.' },
  { icon: Sparkles, title: 'Хайлайты', text: 'Оценка моментов 0–100 с раундом, временем и командой demo_gototick для CS2.' },
  { icon: ShieldQuestion, title: 'Матчмейкинг', text: 'Проверка гипотезы «скрытого пула» прозрачными статистическими тестами.' },
]

export function HomePage() {
  const ds = useDatasets()
  const health = useHealth()
  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-2xl border bg-card p-6 md:p-10">
        <div className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-primary/15 blur-3xl" />
        <div className="relative max-w-2xl space-y-4">
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">FACEIT Intelligence</h1>
          <p className="text-muted-foreground">
            Аналитика CS2 по данным FACEIT и демкам: объективные метрики, сильные и слабые стороны, хайлайты и исследовательский анализ матчмейкинга — с
            честными пометками о качестве данных.
          </p>
          <PlayerSearch size="lg" />
          {health.data && (
            <p className="text-xs text-subtle-foreground">
              Источник данных: {health.data.api_key_configured ? 'FACEIT Data API (ключ настроен)' : 'локальные fixtures — FACEIT_API_KEY не задан'} · парсер демок{' '}
              {health.data.demo_parser}
            </p>
          )}
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

      <section className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Доступные наборы данных</CardTitle>
            <CardDescription>Работают без API-ключа. Каждый набор помечен источником.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {ds.data?.datasets.map((d) =>
              d.players.map((p) => (
                <Link key={p} to={`/players/${encodeURIComponent(p)}`} className="flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors hover:bg-card-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      {d.kind === 'synthetic' && <FlaskConical className="size-4 text-subtle-foreground" />}
                      {p} <SourceBadge source={d.kind} />
                    </div>
                    <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{d.description}</div>
                  </div>
                  <ArrowRight className="size-4 shrink-0 text-subtle-foreground" />
                </Link>
              )),
            )}
          </CardContent>
        </Card>
        <DemoList limit={5} />
      </section>
    </div>
  )
}
