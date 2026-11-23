import { MessageCircle, RefreshCw, Send, Sparkles, Target } from 'lucide-react'
import { type FormEvent, useState } from 'react'

import { type AiAction, type AiCoachStatus, type AiLimit, type AiPoint, type AiReview, useAiCoach, useAiReview, useAskCoach, useCreateGoal } from '@/entities/coach'
import { cn } from '@/shared/lib/cn'
import { dateTime, mapName } from '@/shared/lib/format'
import { useSingleFlight } from '@/shared/lib/use-single-flight'
import { AsyncView, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Hint, InlineError, Input, Notice, Skeleton } from '@/shared/ui'

import { factText } from '../model/fact'
import { goalKey } from '../model/goal-key'

const CERTAINTY: Record<AiPoint['certainty'], { label: string; hint: string; variant: 'good' | 'default' | 'warn' }> = {
  fact: { label: 'факт', hint: 'Прямо видно в цифрах', variant: 'good' },
  estimate: { label: 'оценка', hint: 'Вывод из нескольких цифр', variant: 'default' },
  hypothesis: { label: 'гипотеза', hint: 'Возможная причина — цифры её не доказывают', variant: 'warn' },
}
const QUESTION_MAX = 600
const time = (iso: string) => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })

function limitText(l: AiLimit, what: string) {
  if (l.limit === null) return null
  const reset = l.reset_at ? ` · следующий в ${time(l.reset_at)}` : ''
  return `${what}: ${l.left} из ${l.limit} на 24 ч${l.left === 0 || l.used > 0 ? reset : ''}`
}

/** Claude's review of the player's own numbers: paid per click, every point backed by dossier facts. */
export function AiCoach({ goals }: { goals: string[] }) {
  const status = useAiCoach(true)
  return (
    <Card className="border-primary/25">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" /> ИИ-коуч
        </CardTitle>
        <CardDescription>Claude читает ваши цифры и говорит, что тянет вниз и что делать. Каждый вывод — со ссылками на факты из приложения.</CardDescription>
      </CardHeader>
      <CardContent>
        <AsyncView query={status} skeleton={<Skeleton className="h-24 w-full" />}>
          {(s) => (s.enabled ? <Coach s={s} goals={goals} /> : <Disabled />)}
        </AsyncView>
      </CardContent>
    </Card>
  )
}

function Disabled() {
  return (
    <EmptyState title="ИИ-коуч не подключён" icon={Sparkles} className="p-6">
      Владелец приложения включает его ключом Claude API: <code>ANTHROPIC_API_KEY</code> в <code>backend\.env</code>, затем перезапуск.
    </EmptyState>
  )
}

function Coach({ s, goals }: { s: AiCoachStatus; goals: string[] }) {
  const review = useAiReview()
  const once = useSingleFlight()
  const r = s.review
  const left = s.limits.reviews.left
  const limits = [limitText(s.limits.reviews, 'Разборы'), limitText(s.limits.questions, 'Вопросы')].filter(Boolean)
  const run = () => once(() => review.mutateAsync())
  const button = (
    <Button onClick={run} loading={review.isPending} disabled={left === 0} variant={r ? 'secondary' : 'default'}>
      {r ? <RefreshCw /> : <Sparkles />} {r ? 'Обновить разбор' : 'Разобрать мою игру'}
    </Button>
  )
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        {button}
        <span className="text-xs text-muted-foreground tabular">{s.owner ? 'Без лимитов — вы владелец' : limits.join(' · ')}</span>
      </div>
      {review.isPending && (
        <p className="text-sm text-muted-foreground" role="status">
          Claude читает ваши матчи и демки — обычно 20–60 секунд. Можно не ждать на странице: разбор сохранится.
        </p>
      )}
      <InlineError error={review.error} />
      {r && s.new_matches !== null && (
        <p className="text-xs text-muted-foreground">
          Разбор от {dateTime(r.created_at)}
          {s.new_matches > 0 ? ` · с тех пор сыграно матчей: ${s.new_matches} — стоит обновить` : ' · новых матчей нет, разбор актуален (повторно бесплатно)'}
        </p>
      )}
      {r ? <Review r={r} goals={goals} /> : !review.isPending && <Notice tone="info">Разбор запускается только по кнопке — так лимиты и деньги не тратятся впустую.</Notice>}
      {r && <Chat r={r} limit={s.limits.questions} />}
    </div>
  )
}

function Review({ r, goals }: { r: AiReview; goals: string[] }) {
  return (
    <div className="space-y-5">
      <p className="text-[15px] leading-relaxed">{r.summary}</p>
      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Что тянет вниз">
          {r.problems.map((p) => (
            <PointView key={p.title} p={p} tone="bad" />
          ))}
        </Section>
        <Section title="Что делать">
          {r.actions.map((a) => (
            <ActionView key={a.title} a={a} hasGoal={Boolean(a.goal && goals.includes(goalKey(a.goal.metric, a.goal.map)))} />
          ))}
        </Section>
      </div>
      {r.strengths.length > 0 && (
        <Section title="Что работает — не ломайте">
          <div className="grid gap-2 lg:grid-cols-2">
            {r.strengths.map((p) => (
              <PointView key={p.title} p={p} tone="good" />
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  )
}

function Evidence({ facts }: { facts: AiPoint['evidence'] }) {
  return (
    <ul className="mt-2 space-y-0.5 text-[11px] text-subtle-foreground tabular">
      {facts.map((f) => (
        <li key={f.id}>
          <span className="text-muted-foreground">{f.label}:</span> {factText(f)}
        </li>
      ))}
    </ul>
  )
}

function PointView({ p, tone }: { p: AiPoint; tone: 'good' | 'bad' }) {
  const c = CERTAINTY[p.certainty]
  return (
    <div className={cn('rounded-lg border p-3', tone === 'bad' ? 'border-critical/25' : 'border-good/25')}>
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-medium">{p.title}</div>
        <Hint content={c.hint}>
          <Badge variant={c.variant} className="cursor-help">
            {c.label}
          </Badge>
        </Hint>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{p.detail}</p>
      <Evidence facts={p.evidence} />
    </div>
  )
}

function ActionView({ a, hasGoal }: { a: AiAction; hasGoal: boolean }) {
  const create = useCreateGoal()
  const once = useSingleFlight()
  return (
    <div className="rounded-lg border border-primary/25 p-3">
      <div className="text-sm font-medium">{a.title}</div>
      <p className="mt-1 text-sm text-muted-foreground">{a.detail}</p>
      <Evidence facts={a.evidence} />
      {a.goal && (
        <Button
          size="sm"
          variant="secondary"
          className="mt-2"
          disabled={hasGoal}
          loading={create.isPending}
          onClick={() => once(() => create.mutateAsync({ metric: a.goal!.metric, map: a.goal!.map }))}
        >
          <Target /> {hasGoal ? 'Цель уже есть' : `Сделать целью: ${a.goal.label}${a.goal.map ? ` · ${mapName(a.goal.map)}` : ''}`}
        </Button>
      )}
    </div>
  )
}

function Chat({ r, limit }: { r: AiReview; limit: AiLimit }) {
  const ask = useAskCoach()
  const once = useSingleFlight()
  const [q, setQ] = useState('')
  const blocked = limit.left === 0
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const question = q.trim()
    if (question.length < 2 || blocked) return
    once(() => ask.mutateAsync(question).then(() => setQ('')))
  }
  return (
    <section className="space-y-3 border-t pt-4">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        <MessageCircle className="size-3.5" /> Спросить коуча
      </h3>
      {r.messages.length > 0 && (
        <ol className="space-y-2" aria-label="Разговор с коучем">
          {r.messages.map((m, i) => (
            <li key={i} className={cn('max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-line', m.role === 'player' ? 'ml-auto bg-primary/10' : 'bg-card-2')}>
              {m.text}
            </li>
          ))}
        </ol>
      )}
      {ask.isPending && (
        <p className="text-xs text-muted-foreground" role="status">
          Коуч думает…
        </p>
      )}
      <InlineError error={ask.error} />
      <form onSubmit={submit} className="flex gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          maxLength={QUESTION_MAX}
          placeholder={blocked ? 'Лимит вопросов на 24 часа исчерпан' : 'Например: почему я проигрываю на Nuke? Я играю AWP.'}
          aria-label="Вопрос коучу"
          disabled={blocked}
          className="flex-1"
        />
        <Button type="submit" loading={ask.isPending} disabled={blocked || q.trim().length < 2} aria-label="Спросить">
          <Send />
        </Button>
      </form>
      <p className="text-[11px] text-subtle-foreground">Коуч помнит главное из разговора в коротких заметках, а не всю переписку — поэтому каждый вопрос стоит одинаково.</p>
    </section>
  )
}
