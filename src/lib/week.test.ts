/// <reference types="node" />
import { afterEach, describe, expect, it } from 'vitest'
import { fromISODate, startOfWeek, toISODate } from './week'

// Every date in the app is Singapore's calendar day, so these must hold whatever zone the
// device is in. Node re-reads TZ when it's assigned, so each case can switch zones.
const ZONES = ['Asia/Singapore', 'Australia/Sydney', 'Asia/Tokyo', 'America/Los_Angeles', 'UTC']
const originalTz = process.env.TZ

afterEach(() => {
  process.env.TZ = originalTz
})

describe.each(ZONES)('in %s', (zone) => {
  it('round-trips a date through fromISODate and toISODate', () => {
    process.env.TZ = zone
    for (const iso of ['2026-10-13', '2026-10-14', '2026-12-31', '2027-01-01']) {
      expect(toISODate(fromISODate(iso))).toBe(iso)
    }
  })

  it('puts every day of a week on its Tuesday start', () => {
    process.env.TZ = zone
    // Tue 13 Oct 2026 through Mon 19 Oct 2026 is one business week.
    for (const iso of ['2026-10-13', '2026-10-15', '2026-10-19']) {
      expect(toISODate(startOfWeek(fromISODate(iso)))).toBe('2026-10-13')
    }
    expect(toISODate(startOfWeek(fromISODate('2026-10-20')))).toBe('2026-10-20')
  })
})
