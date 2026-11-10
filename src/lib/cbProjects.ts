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
