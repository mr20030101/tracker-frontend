/// <reference types="node" />
import { afterEach, describe, expect, it } from 'vitest'
import { todayIso, weekStartIso } from './week'

// Singapore is UTC+8, so midnight SGT = 16:00 UTC.
// These tests assert that helpers derived from a live timestamp (useNow) correctly
// roll over at Singapore midnight rather than staying frozen at mount time.

const ZONES = ['Asia/Singapore', 'Australia/Sydney', 'America/Los_Angeles', 'UTC']
const originalTz = process.env.TZ

afterEach(() => {
  process.env.TZ = originalTz
})

describe.each(ZONES)('todayIso in %s', (zone) => {
  it('returns the Singapore date for a timestamp just before midnight SGT', () => {
    process.env.TZ = zone
    // 2026-10-14T15:59:59Z = 23:59:59 SGT = still Oct 14 in Singapore
    const ms = Date.UTC(2026, 9, 14, 15, 59, 59)
    expect(todayIso(ms)).toBe('2026-10-14')
  })

  it('returns the next Singapore date for a timestamp just after midnight SGT', () => {
    process.env.TZ = zone
    // 2026-10-14T16:00:01Z = 00:00:01 SGT on Oct 15 = now Oct 15 in Singapore
    const ms = Date.UTC(2026, 9, 14, 16, 0, 1)
    expect(todayIso(ms)).toBe('2026-10-15')
  })
})

describe.each(ZONES)('weekStartIso in %s', (zone) => {
  it('returns Tuesday SGT as week start for a Monday timestamp (still same week)', () => {
    process.env.TZ = zone
    // 2026-10-19 (Monday) in SGT = UTC+8, so any UTC time on 2026-10-19 up to 15:59 = Monday SGT
    // Week started on 2026-10-13 (Tuesday)
    const ms = Date.UTC(2026, 9, 19, 10, 0, 0) // Monday SGT 18:00
    expect(weekStartIso(ms)).toBe('2026-10-13')
  })

  it('returns the new Tuesday SGT as week start just after the weekly boundary', () => {
    process.env.TZ = zone
    // 2026-10-19T16:00:01Z = 00:00:01 SGT on Tuesday Oct 20 = new week starts
    const ms = Date.UTC(2026, 9, 19, 16, 0, 1)
    expect(weekStartIso(ms)).toBe('2026-10-20')
  })
})
