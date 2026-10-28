import { describe, expect, it } from 'vitest'

import { parseFaceitRef } from '../faceit-ref'

const ID = '1-0acdf87b-7a65-4c1e-9736-f6614ab5d7f2'

describe('parseFaceitRef', () => {
  it.each([
    `https://www.faceit.com/en/cs2/room/${ID}`,
    `https://www.faceit.com/ru/cs2/room/${ID}/scoreboard`,
    `faceit.com/cs2/room/${ID}`,
    `  ${ID.toUpperCase()}  `,
  ])('reads a match room from %s', (v) => {
    expect(parseFaceitRef(v)).toEqual({ kind: 'room', matchId: ID })
  })

  it('reads nicknames and FACEIT profile links', () => {
    expect(parseFaceitRef('limelightttt')).toEqual({ kind: 'player', nickname: 'limelightttt' })
    expect(parseFaceitRef('M1atBoy')).toEqual({ kind: 'player', nickname: 'M1atBoy' })
    expect(parseFaceitRef('https://www.faceit.com/ru/players/s1mple')).toEqual({ kind: 'player', nickname: 's1mple' })
  })

  it.each([`https://faceit.com.evil.io/en/cs2/room/${ID}`, 'two words', 'https://example.com/x', '', 'x'])('ignores %s', (v) => {
    expect(parseFaceitRef(v)).toBeNull()
  })
})
