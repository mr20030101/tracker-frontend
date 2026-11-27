import { supabase } from './api'

// A contributor is assigned projects from the ones their lead runs: a row in
// contributor_project_levels (which also holds their level there) means assigned. One with no rows
// on their lead's projects yet (new, say) counts as on all of them, as everyone did before
// assignments (20261111_cb_project_assignments.sql).

export interface ProjectLeadRow {
  project_id: number
  lead_id: string
}

export interface AssignmentRow {
  user_id: string
  project_id: number
}

/** The ids of the projects a contributor is on: their assigned ones among their lead's projects. */
export function assignedProjectIds(
  userId: string,
  leadId: string | null,
  projectLeads: ProjectLeadRow[],
  assignments: AssignmentRow[],
): number[] {
  if (!leadId) return []
  const leadProjects = projectLeads.filter((row) => row.lead_id === leadId).map((row) => row.project_id)
  const mine = new Set(assignments.filter((row) => row.user_id === userId).map((row) => row.project_id))
  const assigned = leadProjects.filter((id) => mine.has(id))
  return assigned.length > 0 ? assigned : leadProjects
}

export async function fetchProjectLeads(): Promise<ProjectLeadRow[]> {
  const { data, error } = await supabase.from('project_leads').select('project_id, lead_id')
  if (error) throw error
  return data as ProjectLeadRow[]
}

/** Assignments for these people, or everyone the caller may see. */
export async function fetchAssignments(userIds: string[] | null = null): Promise<AssignmentRow[]> {
  let query = supabase.from('contributor_project_levels').select('user_id, project_id')
  if (userIds) query = query.in('user_id', userIds)
  const { data, error } = await query
  if (error) throw error
  return data as AssignmentRow[]
}

/** Assigns a contributor to a project (at the default level) or takes them off it. */
export async function setProjectAssignment(userId: string, projectId: number, assigned: boolean): Promise<void> {
  const { error } = assigned
    ? await supabase
        .from('contributor_project_levels')
        .upsert({ user_id: userId, project_id: projectId }, { onConflict: 'user_id,project_id', ignoreDuplicates: true })
    : await supabase.from('contributor_project_levels').delete().eq('user_id', userId).eq('project_id', projectId)
  if (error) throw error
}

export type BulkAssignMode = 'add' | 'remove' | 'replace'

export type BulkAssignPlan =
  | { userId: string; leadProjectIds: number[]; target: number[] }
  | { userId: string; skipped: 'no-lead' | 'not-their-lead' | 'none-left' }

/**
 * What each contributor's projects become when a lead or admin picks some for many at once: added
 * to theirs, taken off theirs, or put in place of theirs. Only their own lead's projects count, so
 * picking across teams gives each person just the ones their lead runs; anyone it would leave with
 * none (or whose lead runs none of the picked ones) is skipped and keeps what they have.
 */
export function planBulkAssignment(
  users: { id: string; lead_id: string | null }[],
  picked: number[],
  mode: BulkAssignMode,
  projectLeads: ProjectLeadRow[],
  assignments: AssignmentRow[],
): BulkAssignPlan[] {
  const pickedSet = new Set(picked)
  return users.map((user) => {
    if (!user.lead_id) return { userId: user.id, skipped: 'no-lead' }
    const leadProjectIds = projectLeads.filter((row) => row.lead_id === user.lead_id).map((row) => row.project_id)
    const relevant = leadProjectIds.filter((id) => pickedSet.has(id))
    if (relevant.length === 0) return { userId: user.id, skipped: 'not-their-lead' }
    const current = new Set(assignedProjectIds(user.id, user.lead_id, projectLeads, assignments))
    const target =
      mode === 'replace'
        ? relevant
        : mode === 'add'
          ? leadProjectIds.filter((id) => current.has(id) || pickedSet.has(id))
          : leadProjectIds.filter((id) => current.has(id) && !pickedSet.has(id))
    if (target.length === 0) return { userId: user.id, skipped: 'none-left' }
    return { userId: user.id, leadProjectIds, target }
  })
}

/** Puts a contributor on exactly these of their lead's projects (keeping levels on ones they stay on). */
export async function setProjectAssignments(userId: string, leadProjectIds: number[], target: number[]): Promise<void> {
  const keep = new Set(target)
  const { error: addError } = await supabase
    .from('contributor_project_levels')
    .upsert(
      target.map((projectId) => ({ user_id: userId, project_id: projectId })),
      { onConflict: 'user_id,project_id', ignoreDuplicates: true },
    )
  if (addError) throw addError
  const drop = leadProjectIds.filter((id) => !keep.has(id))
  if (drop.length === 0) return
  const { error: dropError } = await supabase.from('contributor_project_levels').delete().eq('user_id', userId).in('project_id', drop)
  if (dropError) throw dropError
}
