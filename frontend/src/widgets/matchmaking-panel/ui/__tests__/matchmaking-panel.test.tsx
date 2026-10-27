import { render, screen } from '@testing-library/react'

import type { Matchmaking } from '@/entities/player'
import { TooltipProvider } from '@/shared/ui'

import { MatchmakingPanel } from '../matchmaking-panel'

const base = {
  method: '', alternatives: ['Тильт'], p_value: null, q_value: null, statistic: null, effect: null, practical: true, chart: null,
}

const data: Matchmaking = {
  matches: 10,
  fdr: 0.1,
  method: '',
  anomalies: [],
  verdict: { code: 'insufficient_data', confidence: 'none', text: 'Недостаточно данных для проверки гипотезы' },
  tests: [
    { ...base, id: 'calibration', title: 'Победы vs ожидание по Elo', question: 'q', n: 0, min_n: 20, status: 'insufficient_data' },
    { ...base, id: 'streaks', title: 'Серии', question: 'q', n: 30, min_n: 20, status: 'anomaly', p_value: 0.001, q_value: 0.004, effect: 'серий меньше ожидаемого',
      chart: { type: 'sequence', sequence: ['W', 'L', 'W'] } },
  ],
}

describe('MatchmakingPanel', () => {
  it('never presents an anomaly as proof and shows data sufficiency', () => {
    render(
      <TooltipProvider>
        <MatchmakingPanel data={data} />
      </TooltipProvider>,
    )
    expect(screen.getByText(/проверить нельзя/)).toBeInTheDocument()
    expect(screen.getByText('Мало данных')).toBeInTheDocument()
    expect(screen.getByText('Аномалия')).toBeInTheDocument()
    expect(screen.getByText(/Hidden Pool Score/)).toBeInTheDocument()
    expect(screen.getByLabelText('Последовательность результатов').children).toHaveLength(3)
  })
})
