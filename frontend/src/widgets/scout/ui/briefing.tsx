import { Crosshair, Map as MapIcon, Shield, ShieldAlert, Swords, Users, Waves } from 'lucide-react'
import { useState } from 'react'

import { EvidenceChip, type ScoutJob } from '@/entities/scout'
import { FeedbackButtons } from '@/features/feedback'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Tabs, TabsList, TabsTrigger } from '@/shared/ui'

const CAT: Record<string, { icon: typeof Shield; label: string }> = {
  strength: { icon: Swords, label: 'Баланс' },
  threat: { icon: Crosshair, label: 'Угроза' },
  map: { icon: MapIcon, label: 'Карта' },
  duo: { icon: Users, label: 'Связки' },
  tactical: { icon: Shield, label: 'Тактика' },
  risk: { icon: ShieldAlert, label: 'Риск' },
  stability: { icon: Waves, label: 'Стабильность' },
}

export function Briefing({ job }: { job: ScoutJob }) {
  const r = job.report!
  const [filter, setFilter] = useState('all')
  const [open, setOpen] = useState<number | null>(null)
  const items = r.briefing.filter((b) => filter === 'all' || b.kind === filter)
  return (
    <Card className="border-primary/25">
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base">Предматчевый брифинг</CardTitle>
          <CardDescription>Каждый вывод выведен из данных и помечен: факт, статистическая оценка или гипотеза. Раскройте пункт, чтобы увидеть доказательства.</CardDescription>
        </div>
        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList>
            <TabsTrigger value="all">Все</TabsTrigger>
            <TabsTrigger value="fact">Факты</TabsTrigger>
            <TabsTrigger value="estimate">Оценки</TabsTrigger>
            <TabsTrigger value="hypothesis">Гипотезы</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent>
        <ol className="space-y-2">
          {items.map((b) => {
            const c = CAT[b.category] ?? CAT.strength
            return (
              <li key={b.id} className="rounded-lg border bg-card-2/30 p-3">
                <div className="flex items-start gap-3">
                  <c.icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label={c.label} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-relaxed">{b.text}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <EvidenceChip kind={b.kind} />
                      {b.confidence && <span className="text-[11px] text-subtle-foreground">уровень: {b.confidence}</span>}
                      <button type="button" className="text-[11px] text-muted-foreground underline-offset-4 hover:underline" onClick={() => setOpen(open === b.id ? null : b.id)}>
                        {open === b.id ? 'скрыть доказательства' : 'доказательства'}
                      </button>
                      <span className="ml-auto">
                        <FeedbackButtons target={`briefing:${b.category}:${b.id}`} matchId={r.match_id} predictionId={job.prediction?.id} />
                      </span>
                    </div>
                    {open === b.id && (
                      <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-background/60 p-2 text-[11px] leading-snug text-muted-foreground">
                        {JSON.stringify(b.evidence, null, 1)}
                      </pre>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      </CardContent>
    </Card>
  )
}
