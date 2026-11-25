import { Scale, ShieldAlert, ShieldCheck } from 'lucide-react'

import { cn } from '@/shared/lib/cn'
import { pct } from '@/shared/lib/format'
import { Badge, Hint } from '@/shared/ui'

import type { MatchFairness } from '../model/types'

type Verdict = Pick<MatchFairness, 'code' | 'label' | 'chance_elo' | 'chance_real' | 'against' | 'favour'>

const TONE = {
  against: { box: 'border-critical/40 bg-critical/[0.07]', icon: ShieldAlert, text: 'text-critical-text', badge: 'bad' },
  favour: { box: 'border-good/30 bg-good/5', icon: ShieldCheck, text: 'text-good-text', badge: 'good' },
  even: { box: 'border-border bg-card-2/40', icon: Scale, text: 'text-foreground', badge: 'default' },
} as const

const HOW =
  'По Elo — официальная формула FACEIT. Реальный — та же формула, но Elo свежих аккаунтов, которые продолжают выигрывать, поправлен на их результаты: такой Elo ещё не догнал уровень игрока.'

function Chances({ v }: { v: Verdict }) {
  if (v.chance_real === null) return null
  return (
    <Hint content={HOW}>
      <span className="cursor-help text-xs text-muted-foreground tabular underline decoration-dotted underline-offset-4">
        реальный шанс <b className={cn('text-sm', TONE[v.code].text)}>{pct(v.chance_real)}</b> · по Elo {pct(v.chance_elo)}
      </span>
    </Hint>
  )
}

/** The verdict of one match as a banner: what makes it unequal, with the numbers behind it. */
export function FairnessVerdict({ v, className }: { v: Verdict; className?: string }) {
  const t = TONE[v.code]
  const reasons = v.code === 'favour' ? v.favour : [...v.against, ...v.favour]
  return (
    <div className={cn('rounded-lg border px-4 py-3', t.box, className)} role={v.code === 'against' ? 'alert' : undefined}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <t.icon className={cn('size-4 shrink-0', t.text)} />
        <span className={cn('text-sm font-semibold tracking-wide', t.text)}>{v.label}</span>
        <Chances v={v} />
      </div>
      {reasons.length > 0 && (
        <ul className="mt-2 space-y-1 pl-7 text-xs text-muted-foreground">
          {reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Compact form for tables of matches. */
export function FairnessBadge({ v }: { v: Verdict }) {
  const short = { against: 'неравный: против вас', favour: 'неравный: в вашу пользу', even: 'равный' }[v.code]
  return <Badge variant={TONE[v.code].badge}>{short}</Badge>
}
