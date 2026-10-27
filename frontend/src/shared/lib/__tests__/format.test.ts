import { clock, fmt, mapName, pct, signed } from '../format'

describe('format', () => {
  it('formats numbers and gaps', () => {
    expect(fmt(1.2345)).toBe('1.23')
    expect(fmt(null)).toBe('—')
    expect(pct(0.537)).toBe('54%')
    expect(signed(12, 0)).toBe('+12')
    expect(signed(-3, 0)).toBe('-3')
    expect(clock(83.6)).toBe('1:24')
    expect(mapName('de_mirage')).toBe('Mirage')
  })
})
