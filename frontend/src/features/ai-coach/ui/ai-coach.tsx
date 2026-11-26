import { RefreshCw, Send, Sparkles, Target } from 'lucide-react'
import { type FormEvent, type ReactNode, useState } from 'react'

import { type AiAction, type AiCoachStatus, type AiFact, type AiLimit, type AiPoint, type AiReview, useAiCoach, useAiReview, useAskCoach, useCreateGoal } from '@/entities/coach'
import { cn } from '@/shared/lib/cn'
import { dateTime, mapName } from '@/shared/lib/format'
import { useSingleFlight } from '@/shared/lib/use-single-flight'
import { AsyncView, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, InlineError, Input, Skeleton } from '@/shared/ui'

import { factText } from '../model/fact'
import { goalKey } from '../model/goal-key'

const CERTAINTY: Record<AiPoint['certainty'], string> = { fact: 'факт', estimate: 'оценка', hypothesis: 'гипотеза' }
const QUESTION_MAX = 600
const time = (iso: string) => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })

function limitText(l: AiLimit, what: string) {
  if (l.limit === null) return null
  return `${l.left} из ${l.limit} ${what}${l.reset_at && l.used > 0 ? ` · следующий в ${time(l.reset_at)}` : ''}`
}

/** Claude's review of the player's own numbers: paid per click, every point backed by dossier facts. */
export function AiCoach({ goals }: { goals: string[] }) {
  const status = useAiCoach(true)
  return (
    <AsyncView query={status} skeleton={<Skeleton className="h-40 w-full rounded-xl" />}>
      {(s) => (s.enabled ? <Coach s={s} goals={goals} /> : <Disabled />)}
    </AsyncView>
  )
}

function Disabled() {
  return (
    <Card>
      <EmptyState title="ИИ-коуч не подключён" icon={Sparkles} className="m-5 p-6">
        Нужен ключ Claude API: <code>ANTHROPIC_API_KEY</code> в <code>backend\.env</code>, затем перезапуск.
      </EmptyState>
    </Card>
  )
}

function Coach({ s, goals }: { s: AiCoachStatus; goals: string[] }) {
  const review = useAiReview()
  const once = useSingleFlight()
  const r = s.review
  const limit = limitText(s.limits.reviews, 'разборов')
  const run = () => once(() => review.mutateAsync())
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" /> ИИ-разбор
          </CardTitle>
          <div className="flex items-center gap-3">
            {limit && <span className="text-xs text-muted-foreground tabular">{limit}</span>}
            <Button onClick={run} loading={review.isPending} disabled={s.limits.reviews.left === 0} variant={r ? 'secondary' : 'default'}>
              {r ? <RefreshCw /> : <Sparkles />} {r ? 'Обновить разбор' : 'Разобрать мою игру'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {review.isPending && (
            <p className="text-sm text-muted-foreground" role="status">
              Разбираем матчи — 20–60 секунд.
            </p>
          )}
          <InlineError error={review.error} />
          {r ? (
            <Review r={r} newMatches={s.new_matches} goals={goals} />
          ) : (
            !review.isPending && <p className="text-sm text-muted-foreground">Что тянет вниз, что делать и что не ломать — по вашим матчам и демкам.</p>
          )}
        </CardContent>
      </Card>
      {r && <Chat r={r} limit={s.limits.questions} />}
    </div>
  )
}

function Review({ r, newMatches, goals }: { r: AiReview; newMatches: number | null; goals: string[] }) {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs text-subtle-foreground">
          {dateTime(r.created_at)}
          {newMatches ? ` · с тех пор ${newMatches} новых матчей — стоит обновить` : ' · новых матчей нет'}
        </p>
        <p className="mt-1.5 text-base leading-relaxed">{r.summary}</p>
      </div>
      <Section title="Что тянет вниз" tone="bad">
        {r.problems.map((p) => (
          <Item key={p.title} title={p.title} certainty={p.certainty} detail={p.detail} evidence={p.evidence} />
        ))}
      </Section>
      <Section title="Что делать" tone="brand">
        {r.actions.map((a) => (
          <Item key={a.title} title={a.title} detail={a.detail} evidence={a.evidence} aside={a.goal && <GoalButton a={a} has={goals.includes(goalKey(a.goal.metric, a.goal.map))} />} />
        ))}
      </Section>
      {r.strengths.length > 0 && (
        <Section title="Что работает" tone="good">
          {r.strengths.map((p) => (
            <Item key={p.title} title={p.title} certainty={p.certainty} detail={p.detail} evidence={p.evidence} />
          ))}
        </Section>
      )}
    </div>
  )
}

const MARK = { bad: 'bg-critical', brand: 'bg-primary', good: 'bg-good' } as const

function Section({ title, tone, children }: { title: string; tone: keyof typeof MARK; children: ReactNode }) {
  return (
    <section>
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <span className={cn('size-2 rounded-full', MARK[tone])} />
        {title}
      </h3>
      <ol className="mt-1 divide-y">{children}</ol>
    </section>
  )
}

function Item({ title, certainty, detail, evidence, aside }: { title: string; certainty?: AiPoint['certainty']; detail: string; evidence: AiFact[]; aside?: ReactNode }) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 py-3">
      <div className="min-w-0 flex-1 basis-96">
        <div className="text-sm font-medium">
          {title}
          {certainty && certainty !== 'fact' && <span className="ml-2 text-xs font-normal text-subtle-foreground">{CERTAINTY[certainty]}</span>}
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">{detail}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {evidence.map((f) => (
            <span key={f.id} className="rounded-md bg-card-2 px-2 py-0.5 text-[11px] text-muted-foreground tabular">
              {f.label}: <b className="font-medium text-foreground">{factText(f)}</b>
            </span>
          ))}
        </div>
      </div>
      {aside}
    </li>
  )
}

function GoalButton({ a, has }: { a: AiAction; has: boolean }) {
  const create = useCreateGoal()
  const once = useSingleFlight()
  const g = a.goal!
  return (
    <Button size="sm" variant="ghost" disabled={has} loading={create.isPending} onClick={() => once(() => create.mutateAsync({ metric: g.metric, map: g.map }))}>
      <Target /> {has ? 'Цель уже есть' : `Сделать целью: ${g.label}${g.map ? ` · ${mapName(g.map)}` : ''}`}
    </Button>
  )
}

function Chat({ r, limit }: { r: AiReview; limit: AiLimit }) {
  const ask = useAskCoach()
  const once = useSingleFlight()
  const [q, setQ] = useState('')
  const blocked = limit.left === 0
  const left = limitText(limit, 'вопросов')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const question = q.trim()
    if (question.length < 2 || blocked) return
    once(() => ask.mutateAsync(question).then(() => setQ('')))
  }
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle>Вопрос коучу</CardTitle>
        {left && <span className="text-xs text-muted-foreground tabular">{left}</span>}
      </CardHeader>
      <CardContent className="space-y-3">
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
            placeholder={blocked ? 'Лимит вопросов на 24 часа исчерпан' : 'Например: почему я проигрываю на Nuke?'}
            aria-label="Вопрос коучу"
            disabled={blocked}
            className="flex-1"
          />
          <Button type="submit" loading={ask.isPending} disabled={blocked || q.trim().length < 2} aria-label="Спросить">
            <Send />
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
