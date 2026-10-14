import { describe, it, expect } from 'vitest'
import { countFullWeeks } from './rewards'

// Business week: Tuesday → Monday (7 days). A "full week" is one whose Tuesday and Monday
// both fall within the closed interval [startsOn, endsOn].

describe('countFullWeeks', () => {
  it('returns 1 for an exact Tue–Mon week', () => {
    // 2026-10-13 = Tue, 2026-10-19 = Mon
    expect(countFullWeeks('2026-10-13', '2026-10-19')).toBe(1)
  })

  it('returns 0 when the range starts on Wednesday (no Tuesday at the start)', () => {
    // 2026-10-14 = Wed, next Tue is Oct 20, its Mon is Oct 26 which is after Oct 19
    expect(countFullWeeks('2026-10-14', '2026-10-19')).toBe(0)
  })

  it('returns 0 when the range ends on Sunday (no full Tue–Mon week fits)', () => {
    // 2026-10-14 = Wed, 2026-10-25 = Sun — next Tue-Mon is Oct 20–26, Mon exceeds end
    expect(countFullWeeks('2026-10-14', '2026-10-25')).toBe(0)
  })

  it('returns 1 when range starts Wed and ends the following Mon', () => {
    // 2026-10-14 = Wed, 2026-10-26 = Mon — week Oct 20–26 fits
    expect(countFullWeeks('2026-10-14', '2026-10-26')).toBe(1)
  })

  it('returns 2 for two consecutive Tue–Mon weeks', () => {
    // Oct 13–26: weeks Oct 13–19 and Oct 20–26
    expect(countFullWeeks('2026-10-13', '2026-10-26')).toBe(2)
  })

  it('returns 0 for a single day (not a full week)', () => {
    expect(countFullWeeks('2026-10-13', '2026-10-13')).toBe(0)
  })

  it('returns 0 when start is after end', () => {
    expect(countFullWeeks('2026-10-20', '2026-10-13')).toBe(0)
  })

  it('counts correctly across a month boundary', () => {
    // 2026-10-27 = Tue, 2026-11-02 = Mon — one full week
    expect(countFullWeeks('2026-10-27', '2026-11-02')).toBe(1)
  })

  it('returns 4 for a four-week range starting on Tuesday', () => {
    // Oct 13 to Nov 09: weeks Oct 13–19, 20–26, 27–Nov 02, Nov 03–09
    expect(countFullWeeks('2026-10-13', '2026-11-09')).toBe(4)
  })
})
