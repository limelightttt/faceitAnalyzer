import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ReportSection } from '../report-section'

describe('ReportSection', () => {
  it('shows content right away when there is something to show', () => {
    render(
      <ReportSection id="threats" title="Угрозы">
        <p>карточки</p>
      </ReportSection>,
    )
    expect(screen.getByText('карточки')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Угрозы' })).toHaveAttribute('id', 'threats')
  })

  it('folds an empty section to one line that still opens', () => {
    render(
      <ReportSection id="tactical" title="Тактика" folded="нет разобранных демок">
        <p>карта</p>
      </ReportSection>,
    )
    expect(screen.queryByText('карта')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Тактика.*нет разобранных демок/ }))
    expect(screen.getByText('карта')).toBeInTheDocument()
  })
})
