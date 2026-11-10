import { assignedProjectIds, type AssignmentRow, type ProjectLeadRow } from './cbProjects'
import { timerSeconds, type TimedTask } from './taskTimer'

// Targets in hours rendered: each project sets Hours / day (projects.daily_hours), and the hours a
// contributor renders are the time on their task timers. A contributor's daily hours are the
// highest of their assigned projects (lib/cbProjects.ts), so being on two doesn't double it.

export function dailyHoursFor(
  userId: string,
  leadId: string | null,
  projects: { id: number; daily_hours?: number | null }[],
  projectLeads: ProjectLeadRow[],
  assignments: AssignmentRow[],
): number {
  const ids = new Set(assignedProjectIds(userId, leadId, projectLeads, assignments))
  return projects.reduce((max, project) => (ids.has(project.id) ? Math.max(max, Number(project.daily_hours ?? 0)) : max), 0)
}

/** Hours on these tasks' timers, counting a timer that's running now. */
export function hoursRendered(tasks: TimedTask[], now = Date.now()): number {
  return tasks.reduce((sum, task) => sum + timerSeconds(task, now), 0) / 3600
}

/** 0 -> '0h', 7.5 -> '7.5h', 7.333 -> '7.3h'. */
export function formatHours(hours: number): string {
  return `${Number(hours.toFixed(1))}h`
}
