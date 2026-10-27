import { Database, FlaskConical, Radio } from 'lucide-react'

import { Badge, Hint } from '@/shared/ui'

import type { DataSource } from '../model/types'

const META: Record<DataSource, { label: string; hint: string; variant: 'good' | 'warn' | 'brand' }> = {
  faceit_api: { label: 'FACEIT API', hint: 'Живые данные официального FACEIT Data API v4', variant: 'good' },
  real_snapshot: {
    label: 'Реальный снимок',
    hint: 'Реальные ответы FACEIT, сохранённые ранее. Части данных (Elo, время) может не быть.',
    variant: 'brand',
  },
  synthetic: {
    label: 'Синтетика',
    hint: 'Сгенерированные данные в формате FACEIT API — только для демонстрации функций. Не реальные матчи.',
    variant: 'warn',
  },
}

export function SourceBadge({ source }: { source: DataSource }) {
  const m = META[source]
  const Icon = source === 'faceit_api' ? Radio : source === 'synthetic' ? FlaskConical : Database
  return (
    <Hint content={m.hint}>
      <span>
        <Badge variant={m.variant}>
          <Icon /> {m.label}
        </Badge>
      </span>
    </Hint>
  )
}
