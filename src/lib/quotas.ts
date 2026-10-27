import { supabase } from './api'
import type { Project, ProjectLevel } from '../types'

// Daily quotas: each project sets how many tasks a day it expects at each CB level, and a
// contributor's weekly target is the quotas on their projects (their lead's projects, at their
// level on each) times five working days. See weekly_target_of() in the schema.

export const QUOTA_LEVELS: ProjectLevel[] = ['contributor', 'l0', 'l1', 'l10']
export const WORKING_DAYS = 5

export function projectQuota(project: Project, level: ProjectLevel): number | null {
  return project[`daily_quota_${level}`] ?? null
}

export interface DailyQuota {
  user_id: string
  project_id: number
  level: ProjectLevel
  daily_quota: number
}

// Only the projects that set a quota for the person's level there; null for everyone the caller
// may see.
export async function fetchDailyQuotas(userIds: string[] | null = null): Promise<DailyQuota[]> {
  const { data, error } = await supabase.rpc('project_daily_quotas', { p_user_ids: userIds })
  if (error) throw error
  return (data ?? []) as DailyQuota[]
}

// Each contributor's target for the week starting weekStart (a Tuesday), by user id.
export async function fetchWeeklyTargets(weekStart: string, userIds: string[] | null = null): Promise<Map<string, number>> {
  const { data, error } = await supabase.rpc('weekly_targets_for', { p_week_start: weekStart, p_user_ids: userIds })
  if (error) throw error
  return new Map(((data ?? []) as { user_id: string; target: number }[]).map((row) => [row.user_id, Number(row.target)]))
}
