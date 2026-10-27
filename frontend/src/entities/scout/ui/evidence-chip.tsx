import { CircleCheck, FlaskConical, Lightbulb } from 'lucide-react'

import { Badge, Hint } from '@/shared/ui'

import type { EvidenceKind } from '../model/types'

const META: Record<EvidenceKind, { label: string; hint: string; icon: typeof CircleCheck; variant: 'default' | 'brand' | 'warn' }> = {
  fact: { label: 'Факт', hint: 'Наблюдаемые данные FACEIT или демок без интерпретации', icon: CircleCheck, variant: 'default' },
  estimate: { label: 'Оценка', hint: 'Статистический расчёт по данным; см. объём выборки и уровень доказательности', icon: FlaskConical, variant: 'brand' },
  hypothesis: { label: 'Гипотеза', hint: 'Интерпретация, которую нужно проверить. Не утверждение.', icon: Lightbulb, variant: 'warn' },
}

export function EvidenceChip({ kind }: { kind: EvidenceKind }) {
  const m = META[kind]
  return (
    <Hint content={m.hint}>
      <span>
        <Badge variant={m.variant}>
          <m.icon /> {m.label}
        </Badge>
      </span>
    </Hint>
  )
}
