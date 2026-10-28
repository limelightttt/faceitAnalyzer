import { Check, HelpCircle, X } from 'lucide-react'
import { useState } from 'react'

import { useSendFeedback } from '@/entities/prediction'
import { useSession } from '@/entities/session'
import { cn } from '@/shared/lib/cn'
import { useSingleFlight } from '@/shared/lib/use-single-flight'
import { Hint, Spinner } from '@/shared/ui'

type Verdict = 'correct' | 'incorrect' | 'unsure'

/** Stores the user's opinion as feedback — never as a confirmed fact. */
export function FeedbackButtons({ target, matchId, predictionId, initial }: { target: string; matchId?: string; predictionId?: number; initial?: string }) {
  const { data: session } = useSession()
  const send = useSendFeedback()
  const once = useSingleFlight()
  const [sent, setSent] = useState<string | undefined>(initial)
  if (!session?.authenticated) return null
  const btn = (v: Verdict, Icon: typeof Check, label: string) => (
    <Hint content={label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={sent === v}
        disabled={send.isPending}
        aria-busy={(send.isPending && send.variables?.verdict === v) || undefined}
        onClick={() => once(() => send.mutateAsync({ target, verdict: v, match_id: matchId, prediction_id: predictionId }).then(() => setSent(v)))}
        className={cn(
          'pressable inline-flex size-6 items-center justify-center rounded-md border text-subtle-foreground hover:bg-card-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60',
          sent === v && v === 'correct' && 'border-good/40 bg-good/10 text-good-text',
          sent === v && v === 'incorrect' && 'border-critical/40 bg-critical/10 text-critical-text',
          sent === v && v === 'unsure' && 'bg-card-2 text-foreground',
        )}
      >
        {send.isPending && send.variables?.verdict === v ? <Spinner className="size-3" /> : <Icon className={cn('size-3.5', sent === v && 'animate-pop-in')} />}
      </button>
    </Hint>
  )
  return (
    <span className="inline-flex items-center gap-1">
      {btn('correct', Check, 'Вывод подтвердился (ваш отзыв)')}
      {btn('incorrect', X, 'Вывод не подтвердился (ваш отзыв)')}
      {btn('unsure', HelpCircle, 'Не уверен')}
    </span>
  )
}
