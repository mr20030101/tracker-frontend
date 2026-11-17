import { describe, expect, it } from 'vitest'
import { clockOffset } from './serverClock'

const server = Date.parse('Tue, 17 Nov 2026 09:15:07 GMT')

describe('clockOffset', () => {
  it('ignores differences the whole-second header cannot show', () => {
    expect(clockOffset('Tue, 17 Nov 2026 09:15:07 GMT', server + 100, server + 300)).toBe(0)
  })

  it('corrects a device clock that is behind', () => {
    const device = server - 10 * 60_000
    expect(clockOffset('Tue, 17 Nov 2026 09:15:07 GMT', device, device + 200)).toBe(10 * 60_000 + 400)
  })

  it('corrects a device clock that is ahead, across midnight', () => {
    const device = server + 15 * 3600_000
    expect(clockOffset('Tue, 17 Nov 2026 09:15:07 GMT', device, device)).toBe(-15 * 3600_000 + 500)
  })

  it('returns null for a missing or broken header', () => {
    expect(clockOffset('not a date', server, server)).toBeNull()
  })
})
