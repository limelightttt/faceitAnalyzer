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

const view = (d: Matchmaking) =>
  render(
    <TooltipProvider>
      <MatchmakingPanel data={d} />
    </TooltipProvider>,
  )

describe('MatchmakingPanel', () => {
  it('states the hidden-pool verdict plainly, without disclaimers', () => {
    view({ ...data, verdict: { code: 'anomaly', confidence: 'low', text: 'Подбор ведёт себя не как честный подбор по Elo: Серии.' } })
    expect(screen.getByText('АНОМАЛИЯ')).toBeInTheDocument()
    expect(screen.getByText(/не как честный подбор по Elo/)).toBeInTheDocument()
    expect(screen.queryByText(/не доказательство|не утверждаем|Hidden Pool Score/)).toBeNull()
  })

  it('shows per-test status, chance of a fluke only for signals, and the result sequence', () => {
    view(data)
    expect(screen.getAllByText('Мало данных')).toHaveLength(2) // the verdict and the under-sampled test
    expect(screen.getByText('Аномалия')).toBeInTheDocument()
    expect(screen.getByText('шанс случайности 0.1%')).toBeInTheDocument()
    expect(screen.getByText('0 матчей из 20 нужных')).toBeInTheDocument()
    expect(screen.getByLabelText('Последовательность результатов').children).toHaveLength(3)
  })
})
