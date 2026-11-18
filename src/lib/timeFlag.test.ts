import { describe, expect, it } from 'vitest'
import { timeFlagFilter } from './timeFlag'

const NOW = Date.parse('2026-11-18T12:00:00Z')

describe('timeFlagFilter', () => {
  it('is null with no flag', () => {
    expect(timeFlagFilter('', NOW)).toBeNull()
  })

  it('flags submitted tasks with under 2 minutes on a stopped timer', () => {
    expect(timeFlagFilter('short', NOW)).toBe('and(status.eq.submitted,timer_started_at.is.null,timer_elapsed_seconds.lt.120)')
  })

  it('flags 3 hours banked, or a run started over 3 hours ago', () => {
    expect(timeFlagFilter('long', NOW)).toBe('timer_elapsed_seconds.gte.10800,timer_started_at.lt."2026-11-18T09:00:00.000Z"')
  })

  it('unusual is either', () => {
    expect(timeFlagFilter('unusual', NOW)).toBe(`${timeFlagFilter('short', NOW)},${timeFlagFilter('long', NOW)}`)
  })
})
