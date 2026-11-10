import { describe, expect, it } from 'vitest'
import { assignedProjectIds } from './cbProjects'

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
