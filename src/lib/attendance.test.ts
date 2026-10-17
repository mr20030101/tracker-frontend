import { describe, expect, it } from 'vitest'
import { attendanceWindow } from './attendance'

// Singapore is UTC+8 all year, so 06:00 SGT is 22:00 UTC the day before.
const sg = (hhmm: string) => new Date(`2026-10-17T${hhmm}:00+08:00`)

describe('attendanceWindow', () => {
  it('is not open before 6:00 AM Singapore time', () => {
    expect(attendanceWindow(sg('05:59'))).toBe('not-open')
  })

  it('opens at 6:00 AM and stays open through 2:29 PM', () => {
    expect(attendanceWindow(sg('06:00'))).toBe('open')
    expect(attendanceWindow(sg('14:29'))).toBe('open')
  })

  it('closes at 2:30 PM', () => {
    expect(attendanceWindow(sg('14:30'))).toBe('closed')
    expect(attendanceWindow(sg('23:59'))).toBe('closed')
  })
})
