import { describe, expect, it } from 'vitest'
import { isManagerRole, seesManyTeams } from './roles'
import { auditsAllowed } from './teamFeatures'
import { timeEditMode } from './taskTimer'

describe('roles', () => {
  it('counts team managers as managers', () => {
    expect(isManagerRole('team_manager')).toBe(true)
    expect(isManagerRole('lead')).toBe(true)
    expect(isManagerRole('admin')).toBe(true)
    expect(isManagerRole('contributor')).toBe(false)
    expect(isManagerRole(undefined)).toBe(false)
  })

  it('gives admins and team managers the many-teams views, not leads', () => {
    expect(seesManyTeams('admin')).toBe(true)
    expect(seesManyTeams('team_manager')).toBe(true)
    expect(seesManyTeams('lead')).toBe(false)
    expect(seesManyTeams('contributor')).toBe(false)
  })
})

describe('auditsAllowed', () => {
  it('lets admins in', () => {
    expect(auditsAllowed({ role: 'admin' }, 'bootcamp', true)).toBe(true)
  })

  it("follows a team manager's own program, not a team's", () => {
    expect(auditsAllowed({ role: 'team_manager', program: 'rst' }, 'bootcamp', true)).toBe(true)
    expect(auditsAllowed({ role: 'team_manager', program: 'bootcamp' }, 'rst', true)).toBe(false)
    expect(auditsAllowed({ role: 'team_manager', program: null }, 'rst', true)).toBe(false)
  })

  it("follows a lead's team program, letting them through until it loads", () => {
    expect(auditsAllowed({ role: 'lead' }, 'rst', true)).toBe(true)
    expect(auditsAllowed({ role: 'lead' }, 'bootcamp', true)).toBe(false)
    expect(auditsAllowed({ role: 'lead' }, 'bootcamp', false)).toBe(true)
  })

  it('keeps contributors out', () => {
    expect(auditsAllowed({ role: 'contributor' }, 'rst', true)).toBe(false)
    expect(auditsAllowed(null, 'rst', true)).toBe(false)
  })
})

describe('timeEditMode for a team manager', () => {
  it("can set any time on someone else's task, like a lead", () => {
    expect(timeEditMode({ id: 'tm', role: 'team_manager' }, 'cb')).toBe('any')
  })
})
