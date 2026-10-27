import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'

import type { ScoutJob } from '@/entities/scout'
import { TooltipProvider } from '@/shared/ui'

import { Briefing } from '../briefing'

const job = {
  id: 'x',
  match_id: 'm',
  status: 'done',
  progress: 1,
  error: null,
  created_at: '',
  prediction: null,
  report: {
    match_id: 'm',
    briefing: [
      { id: 1, kind: 'fact', category: 'threat', text: 'Главная угроза — X', evidence: { elo: 2100 }, confidence: null, refs: [] },
      { id: 2, kind: 'hypothesis', category: 'risk', text: 'Y: необычный профиль', evidence: { signals: 2 }, confidence: 'low', refs: [] },
    ],
  },
} as unknown as ScoutJob

function wrap(ui: React.ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <TooltipProvider>{ui}</TooltipProvider>
    </QueryClientProvider>,
  )
}

describe('Briefing', () => {
  it('labels every item by evidence type and filters by it', () => {
    wrap(<Briefing job={job} />)
    expect(screen.getByText('Факт')).toBeInTheDocument()
    expect(screen.getByText('Гипотеза')).toBeInTheDocument()
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Гипотезы' }))
    expect(screen.queryByText('Главная угроза — X')).not.toBeInTheDocument()
    expect(screen.getByText('Y: необычный профиль')).toBeInTheDocument()
  })

  it('reveals evidence on demand', () => {
    wrap(<Briefing job={job} />)
    fireEvent.click(screen.getAllByText('доказательства')[0])
    expect(screen.getByText(/"elo": 2100/)).toBeInTheDocument()
  })
})
