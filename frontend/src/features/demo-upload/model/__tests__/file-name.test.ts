import { describe, expect, it } from 'vitest'

import { isDemoFileName } from '../file-name'

describe('isDemoFileName', () => {
  it('accepts demos and archives, including renamed repeat downloads', () => {
    for (const name of ['match.dem', '1-abc-1-1.dem.zst', 'match.dem (1).zst', 'MATCH.DEM.GZ', 'match.dem.bz2']) {
      expect(isDemoFileName(name), name).toBe(true)
    }
  })

  it('rejects other files', () => {
    for (const name of ['match.zip', 'notes.txt', 'match.dem.rar', 'zst']) expect(isDemoFileName(name), name).toBe(false)
  })
})
