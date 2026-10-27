import { Check, HelpCircle, X } from 'lucide-react'
import { useState } from 'react'

import { useSendFeedback } from '@/entities/prediction'
import { useSession } from '@/entities/session'
import { cn } from '@/shared/lib/cn'
import { Hint } from '@/shared/ui'

type Verdict = 'correct' | 'incorrect' | 'unsure'

/** Stores the user's opinion as feedback — never as a confirmed fact. */
export function FeedbackButtons({ target, matchId, predictionId, initial }: { target: string; matchId?: string; predictionId?: number; initial?: string }) {
  const { data: session } = useSession()
  const send = useSendFeedback()
  const [sent, setSent] = useState<string | undefined>(initial)
  if (!session?.authenticated) return null
  const btn = (v: Verdict, Icon: typeof Check, label: string) => (
    <Hint content={label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={sent === v}
        disabled={send.isPending}
        onClick={() => send.mutate({ target, verdict: v, match_id: matchId, prediction_id: predictionId }, { onSuccess: () => setSent(v) })}
        className={cn(
          'inline-flex size-6 items-center justify-center rounded-md border text-subtle-foreground transition-colors hover:bg-card-2 hover:text-foreground',
          sent === v && v === 'correct' && 'border-good/40 bg-good/10 text-good-text',
          sent === v && v === 'incorrect' && 'border-critical/40 bg-critical/10 text-critical-text',
          sent === v && v === 'unsure' && 'bg-card-2 text-foreground',
        )}
      >
        <Icon className="size-3.5" />
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
