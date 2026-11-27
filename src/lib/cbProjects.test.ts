import { describe, expect, it } from 'vitest'
import { assignedProjectIds, planBulkAssignment } from './cbProjects'

const projectLeads = [
  { project_id: 1, lead_id: 'ina' },
  { project_id: 2, lead_id: 'ina' },
  { project_id: 3, lead_id: 'jay' },
]

describe('assignedProjectIds', () => {
  it("is the projects they're assigned, among their lead's", () => {
    expect(assignedProjectIds('cb', 'ina', projectLeads, [{ user_id: 'cb', project_id: 2 }])).toEqual([2])
  })

  it("counts them on all their lead's projects until they're assigned any", () => {
    expect(assignedProjectIds('cb', 'ina', projectLeads, [])).toEqual([1, 2])
  })

  it("ignores assignments to projects their lead doesn't run (e.g. after moving teams)", () => {
    expect(assignedProjectIds('cb', 'ina', projectLeads, [{ user_id: 'cb', project_id: 3 }])).toEqual([1, 2])
    expect(assignedProjectIds('cb', 'jay', projectLeads, [{ user_id: 'cb', project_id: 1 }, { user_id: 'cb', project_id: 3 }])).toEqual([3])
  })

  it("doesn't mix up people", () => {
    expect(assignedProjectIds('cb', 'ina', projectLeads, [{ user_id: 'someone', project_id: 2 }])).toEqual([1, 2])
  })

  it('is none without a lead', () => {
    expect(assignedProjectIds('cb', null, projectLeads, [{ user_id: 'cb', project_id: 1 }])).toEqual([])
  })
})

describe('planBulkAssignment', () => {
  const users = [
    { id: 'a', lead_id: 'ina' },
    { id: 'b', lead_id: 'jay' },
  ]

  it("adds the picked projects to each person's, among their own lead's", () => {
    expect(planBulkAssignment(users, [2, 3], 'add', projectLeads, [{ user_id: 'a', project_id: 1 }])).toEqual([
      { userId: 'a', leadProjectIds: [1, 2], target: [1, 2] },
      { userId: 'b', leadProjectIds: [3], target: [3] },
    ])
  })

  it('replaces their projects with the picked ones', () => {
    expect(planBulkAssignment([users[0]], [2], 'replace', projectLeads, [])).toEqual([{ userId: 'a', leadProjectIds: [1, 2], target: [2] }])
  })

  it('takes the picked ones off, counting someone with no assignments as on all', () => {
    expect(planBulkAssignment([users[0]], [1], 'remove', projectLeads, [])).toEqual([{ userId: 'a', leadProjectIds: [1, 2], target: [2] }])
  })

  it("skips anyone it would leave with no projects, whose lead runs none picked, or who has no lead", () => {
    expect(planBulkAssignment([users[0]], [1, 2], 'remove', projectLeads, [])).toEqual([{ userId: 'a', skipped: 'none-left' }])
    expect(planBulkAssignment([users[1]], [1], 'add', projectLeads, [])).toEqual([{ userId: 'b', skipped: 'not-their-lead' }])
    expect(planBulkAssignment([{ id: 'c', lead_id: null }], [1], 'add', projectLeads, [])).toEqual([{ userId: 'c', skipped: 'no-lead' }])
  })
})
