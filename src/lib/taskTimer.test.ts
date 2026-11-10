import { describe, expect, it } from 'vitest'
import { formatTimer, isTimerRunning, timerLimitSeconds, timerSeconds } from './taskTimer'

describe('timerSeconds', () => {
  const start = '2026-10-24T01:00:00.000Z'
  const now = new Date(start).getTime()

  it('is the banked time while paused', () => {
    expect(timerSeconds({ timer_started_at: null, timer_elapsed_seconds: 90 }, now)).toBe(90)
    expect(timerSeconds({}, now)).toBe(0)
  })

  it('adds the current run while running', () => {
    expect(timerSeconds({ timer_started_at: start, timer_elapsed_seconds: 90 }, now + 65_500)).toBe(155)
  })

  it('never counts back when the device clock is behind', () => {
    expect(timerSeconds({ timer_started_at: start, timer_elapsed_seconds: 10 }, now - 5_000)).toBe(10)
  })

  it('stops at the limit, 3 hours unless the project sets one', () => {
    expect(timerSeconds({ timer_started_at: start, timer_elapsed_seconds: 10_000 }, now + 3_600_000)).toBe(10_800)
    expect(timerSeconds({ timer_started_at: null, timer_elapsed_seconds: 20_000 }, now)).toBe(10_800)
    expect(timerSeconds({ timer_started_at: null, timer_elapsed_seconds: 20_000 }, now, timerLimitSeconds({ timer_limit_minutes: 60 }))).toBe(3_600)
  })

  it('reads the limit from the project', () => {
    expect(timerLimitSeconds(null)).toBe(10_800)
    expect(timerLimitSeconds({ timer_limit_minutes: null })).toBe(10_800)
    expect(timerLimitSeconds({ timer_limit_minutes: 90 })).toBe(5_400)
  })

  it('runs while a start time is set', () => {
    expect(isTimerRunning({ timer_started_at: start })).toBe(true)
    expect(isTimerRunning({ timer_started_at: null })).toBe(false)
  })
})

describe('formatTimer', () => {
  it('shows minutes and seconds, and hours once there are any', () => {
    expect(formatTimer(0)).toBe('0:00')
    expect(formatTimer(75)).toBe('1:15')
    expect(formatTimer(3725)).toBe('1:02:05')
  })
})
