import { timerSeconds, type TimedTask } from './taskTimer'

// Targets in hours rendered: each project sets Hours / day (projects.daily_hours), and the hours a
// contributor renders are the time on their task timers. A contributor's daily hours are the
// highest of the projects on their lead's team, so being on two projects doesn't double it.

export function dailyHoursFor(
  leadId: string | null,
  projects: { id: number; daily_hours?: number | null }[],
  projectLeads: { project_id: number; lead_id: string }[],
): number {
  if (!leadId) return 0
  const projectIds = new Set(projectLeads.filter((row) => row.lead_id === leadId).map((row) => row.project_id))
  return projects.reduce((max, project) => (projectIds.has(project.id) ? Math.max(max, Number(project.daily_hours ?? 0)) : max), 0)
}

/** Hours on these tasks' timers, counting a timer that's running now. */
export function hoursRendered(tasks: TimedTask[], now = Date.now()): number {
  return tasks.reduce((sum, task) => sum + timerSeconds(task, now), 0) / 3600
}

/** 0 -> '0h', 7.5 -> '7.5h', 7.333 -> '7.3h'. */
export function formatHours(hours: number): string {
  return `${Number(hours.toFixed(1))}h`
}
