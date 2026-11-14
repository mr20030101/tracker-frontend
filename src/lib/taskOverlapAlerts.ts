import { supabase } from './api'

/** Someone logged a task ID that a person on another team had already logged. */
export interface TaskOverlapAlert {
  id: number
  task_id: string
  logged_by: string
  logged_by_team: string | null
  other_by: string
  other_team: string | null
  created_at: string
}

export async function fetchUnreadTaskOverlapAlerts(): Promise<TaskOverlapAlert[]> {
  const { data, error } = await supabase
    .from('task_overlap_alerts')
    .select('id, task_id, logged_by, logged_by_team, other_by, other_team, created_at')
    .is('read_at', null)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return (data ?? []) as TaskOverlapAlert[]
}

export async function markTaskOverlapAlertsRead(ids: number[]): Promise<void> {
  if (ids.length === 0) return
  const { error } = await supabase.from('task_overlap_alerts').update({ read_at: new Date().toISOString() }).in('id', ids)
  if (error) throw error
}

export function teamLabel(leadName: string | null): string {
  return leadName ? `${leadName}'s team` : 'no team'
}
