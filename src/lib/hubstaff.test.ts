import { describe, expect, it } from 'vitest'
import { formatHubstaffHours, hubstaffAllowed, parseHubstaffHours } from './hubstaff'

describe('parseHubstaffHours', () => {
  it('reads the formats Hubstaff and people use', () => {
    expect(parseHubstaffHours('7:32')).toBe(452)
    expect(parseHubstaffHours('07:32:59')).toBe(452)
    expect(parseHubstaffHours('7.5')).toBe(450)
    expect(parseHubstaffHours('8')).toBe(480)
    expect(parseHubstaffHours('7h 32m')).toBe(452)
    expect(parseHubstaffHours('7 hrs')).toBe(420)
    expect(parseHubstaffHours('45m')).toBe(45)
    expect(parseHubstaffHours('0:00')).toBe(0)
    expect(parseHubstaffHours('24:00')).toBe(1440)
  })

  it('rejects anything that is not a day-length time', () => {
    for (const bad of ['', 'abc', '7:75', '25', '24:01', '-1', '7:3', 'h', '1,5']) expect(parseHubstaffHours(bad)).toBeNull()
  })
})

describe('formatHubstaffHours', () => {
  it('shows h:mm', () => {
    expect(formatHubstaffHours(452)).toBe('7:32')
    expect(formatHubstaffHours(5)).toBe('0:05')
    expect(formatHubstaffHours(1440)).toBe('24:00')
  })
})

describe('hubstaffAllowed', () => {
  it('lets in RST people, the RST team manager and admins only', () => {
    expect(hubstaffAllowed({ role: 'admin' }, 'bootcamp', true)).toBe(true)
    expect(hubstaffAllowed({ role: 'team_manager', program: 'rst' }, 'bootcamp', true)).toBe(true)
    expect(hubstaffAllowed({ role: 'team_manager', program: 'bootcamp' }, 'rst', true)).toBe(false)
    expect(hubstaffAllowed({ role: 'contributor' }, 'rst', true)).toBe(true)
    expect(hubstaffAllowed({ role: 'lead' }, 'rst', true)).toBe(true)
    expect(hubstaffAllowed({ role: 'contributor' }, 'bootcamp', true)).toBe(false)
    expect(hubstaffAllowed(null, 'rst', true)).toBe(false)
  })
})
