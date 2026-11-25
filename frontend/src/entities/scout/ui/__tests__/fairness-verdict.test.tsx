import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { TooltipProvider } from '@/shared/ui'

import { FairnessVerdict } from '../fairness-verdict'

const base = { chance_elo: 0.5, chance_real: 0.24, against: [] as string[], favour: [] as string[] }
const view = (v: Parameters<typeof FairnessVerdict>[0]['v']) =>
  render(
    <TooltipProvider>
      <FairnessVerdict v={v} />
    </TooltipProvider>,
  )

describe('FairnessVerdict', () => {
  it('raises an unequal match as an alert with its reasons and both chances', () => {
    view({ ...base, code: 'against', label: 'НЕРАВНЫЙ МАТЧ — против вас', against: ['У соперников пачка с разбросом 1100 Elo'] })
    expect(screen.getByRole('alert')).toHaveTextContent('НЕРАВНЫЙ МАТЧ — против вас')
    expect(screen.getByText('У соперников пачка с разбросом 1100 Elo')).toBeInTheDocument()
    expect(screen.getByText(/по Elo 50%/)).toBeInTheDocument()
    expect(screen.getByText('24%')).toBeInTheDocument()
  })

  it('shows an even match quietly', () => {
    view({ ...base, chance_real: 0.5, code: 'even', label: 'Равный матч' })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText('Равный матч')).toBeInTheDocument()
  })
})
