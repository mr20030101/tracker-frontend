import { describe, expect, it } from 'vitest'
import { attendanceTimeLabel, attendanceWindow, minutesToTimeInput, timeInputToMinutes } from './attendance'
import { formatCountdown, secondsUntilClose } from '../components/AttendanceBomb'

// Singapore is UTC+8 all year, so 06:00 SGT is 22:00 UTC the day before.
const sg = (hhmm: string, day = '2026-10-16') => new Date(`${day}T${hhmm}:00+08:00`)

describe('attendanceWindow', () => {
  it('is not open before 6:00 AM Singapore time', () => {
    expect(attendanceWindow(sg('05:59'))).toBe('not-open')
  })

  it('opens at 6:00 AM and stays open through 1:29 PM', () => {
    expect(attendanceWindow(sg('06:00'))).toBe('open')
    expect(attendanceWindow(sg('13:29'))).toBe('open')
  })

  it('closes at 1:30 PM', () => {
    expect(attendanceWindow(sg('13:30'))).toBe('closed')
    expect(attendanceWindow(sg('23:59'))).toBe('closed')
  })

  it('stays open all day on a date in OPEN_ALL_DAY_DATES', () => {
    expect(attendanceWindow(sg('05:00', '2026-10-17'))).toBe('open')
    expect(attendanceWindow(sg('22:00', '2026-10-17'))).toBe('open')
  })
})

describe('attendanceWindow with a team closing time', () => {
  it('closes at the given time instead of 1:30 PM', () => {
    expect(attendanceWindow(sg('14:59'), 15 * 60)).toBe('open')
    expect(attendanceWindow(sg('15:00'), 15 * 60)).toBe('closed')
    expect(attendanceWindow(sg('12:00'), 11 * 60)).toBe('closed')
  })

  it('still opens at 6:00 AM', () => {
    expect(attendanceWindow(sg('05:59'), 15 * 60)).toBe('not-open')
  })
})

describe('attendance time helpers', () => {
  it('labels minutes as a clock time', () => {
    expect(attendanceTimeLabel(810)).toBe('1:30 PM')
    expect(attendanceTimeLabel(12 * 60)).toBe('12:00 PM')
    expect(attendanceTimeLabel(6 * 60 + 5)).toBe('6:05 AM')
    expect(attendanceTimeLabel(23 * 60 + 59)).toBe('11:59 PM')
  })

  it('converts to and from a time input', () => {
    expect(minutesToTimeInput(810)).toBe('13:30')
    expect(timeInputToMinutes('13:30')).toBe(810)
    expect(timeInputToMinutes('')).toBeNull()
  })
})

describe('attendance countdown', () => {
  it('counts the seconds to the closing time', () => {
    expect(secondsUntilClose(sg('13:29'), 810)).toBe(60)
    expect(secondsUntilClose(new Date('2026-10-16T13:29:45+08:00'), 810)).toBe(15)
    expect(secondsUntilClose(sg('06:00'), 810)).toBe(7.5 * 3600)
  })

  it('shows it as hours, minutes and seconds', () => {
    expect(formatCountdown(7.5 * 3600)).toBe('07:30:00')
    expect(formatCountdown(59)).toBe('00:00:59')
    expect(formatCountdown(-5)).toBe('00:00:00')
  })
})
