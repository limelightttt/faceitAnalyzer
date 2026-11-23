import { describe, expect, it } from 'vitest'

import { factText } from '../fact'

describe('factText', () => {
  it('formats shares, ratings and sample sizes', () => {
    expect(factText({ id: 'form.recent.win_rate', label: 'WR', value: 0.42, n: 20 })).toBe('42% (n = 20)')
    expect(factText({ id: 'form.recent.rating', label: 'R', value: 0.951 })).toBe('0.95')
    expect(factText({ id: 'form.recent.adr', label: 'ADR', value: 71.25 })).toBe('71.3')
  })

  it('reads composite facts as words', () => {
    expect(factText({ id: 'map.de_nuke', label: 'Nuke', value: { win_rate: 0.31, rating: 0.88 }, n: 13 })).toBe('WR 31% · R 0.88 (n = 13)')
    expect(factText({ id: 'lobby.adr', label: 'ADR', value: { you: 68.4, lobby: 79.1, verdict: 'weakness', confidence: 'high' }, n: 40 })).toBe(
      'вы 68.4 · лобби 79.1 · слабое место · доверие высокое (n = 40)',
    )
    expect(factText({ id: 'elo.observed', label: 'Elo', value: { first: 1996, peak: 1996, low: 1712, last: 1850 }, n: 9 })).toBe(
      'было 1996 · пик 1996 · минимум 1712 · сейчас 1850 (n = 9)',
    )
  })
})
