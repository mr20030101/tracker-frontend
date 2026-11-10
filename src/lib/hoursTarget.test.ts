import { describe, expect, it } from 'vitest'
import { dailyHoursFor, formatHours, hoursRendered } from './hoursTarget'

const projects = [
  { id: 1, daily_hours: 8 },
  { id: 2, daily_hours: 6 },
  { id: 3, daily_hours: null },
]
const projectLeads = [
  { project_id: 1, lead_id: 'ina' },
  { project_id: 2, lead_id: 'ina' },
  { project_id: 2, lead_id: 'jay' },
  { project_id: 3, lead_id: 'bermar' },
]

describe('dailyHoursFor', () => {
  it("takes the highest Hours / day among their projects, not the sum (all their lead's until assigned)", () => {
    expect(dailyHoursFor('cb', 'ina', projects, projectLeads, [])).toBe(8)
    expect(dailyHoursFor('cb', 'jay', projects, projectLeads, [])).toBe(6)
  })

  it('goes by the projects they are assigned', () => {
    expect(dailyHoursFor('cb', 'ina', projects, projectLeads, [{ user_id: 'cb', project_id: 2 }])).toBe(6)
  })

  it('is 0 without a lead or when none of their projects sets hours', () => {
    expect(dailyHoursFor('cb', null, projects, projectLeads, [])).toBe(0)
    expect(dailyHoursFor('cb', 'bermar', projects, projectLeads, [])).toBe(0)
    expect(dailyHoursFor('cb', 'nobody', projects, projectLeads, [])).toBe(0)
  })

  it('reads hours that arrive as text from the database', () => {
    expect(dailyHoursFor('cb', 'ina', [{ id: 1, daily_hours: '7.5' as unknown as number }], projectLeads, [])).toBe(7.5)
  })
})

describe('hoursRendered', () => {
  const now = new Date('2026-11-11T02:00:00Z').getTime()

  it('adds up the timers, counting one that is running', () => {
    expect(
      hoursRendered(
        [
          { timer_elapsed_seconds: 3600, timer_started_at: null },
          { timer_elapsed_seconds: 1800, timer_started_at: '2026-11-11T01:30:00Z' },
        ],
        now,
      ),
    ).toBe(2)
  })

  it('is 0 with no time', () => {
    expect(hoursRendered([], now)).toBe(0)
  })
})

describe('formatHours', () => {
  it('shows up to one decimal', () => {
    expect(formatHours(0)).toBe('0h')
    expect(formatHours(7.5)).toBe('7.5h')
    expect(formatHours(7.333)).toBe('7.3h')
    expect(formatHours(40)).toBe('40h')
  })
})
