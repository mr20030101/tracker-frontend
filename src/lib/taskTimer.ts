import { supabase } from './api'

// Each task has a timer: it starts by itself when a contributor logs a task that's in progress,
// they can start and pause it by hand, and it stops once the task is no longer in progress. The
// database keeps the times on its own clock and runs one timer per person at a time
// (task_submissions_timer in supabase/migrations/20261024_task_timers.sql).

export interface TimedTask {
  timer_started_at?: string | null
  timer_elapsed_seconds?: number
}

export function isTimerRunning(task: TimedTask): boolean {
  return Boolean(task.timer_started_at)
}

/** Seconds spent on the task so far, counting the current run if it's going. */
export function timerSeconds(task: TimedTask, now = Date.now()): number {
  const banked = task.timer_elapsed_seconds ?? 0
  const running = task.timer_started_at
    ? Math.max(0, Math.floor((now - new Date(task.timer_started_at).getTime()) / 1000))
    : 0
  return banked + running
}

/** 75 -> '1:15', 3725 -> '1:02:05'. */
export function formatTimer(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = String(seconds % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

/** Starts or pauses a task's timer. Starting one pauses any other the person has running. */
export async function setTaskTimer(submissionId: number, running: boolean): Promise<void> {
  // Any value starts it: the database replaces it with its own time.
  const { error } = await supabase
    .from('task_submissions')
    .update({ timer_started_at: running ? new Date().toISOString() : null })
    .eq('id', submissionId)
  if (error) throw error
}

/** Sets the time on a task's timer. Leads and admins can set any time; a contributor can only lower their own. */
export async function setTaskTimerSeconds(submissionId: number, seconds: number): Promise<void> {
  const { error } = await supabase.rpc('set_task_timer_seconds', { p_submission_id: submissionId, p_seconds: seconds })
  if (error) throw error
}

/** How a viewer may correct a task's time, mirroring set_task_timer_seconds: the database has the final say. */
export function timeEditMode(viewer: { id: string; role: string } | null | undefined, taskUserId: string | null): 'any' | 'lower' | undefined {
  if (!viewer) return undefined
  if (viewer.role === 'admin') return 'any'
  if (taskUserId && taskUserId === viewer.id) return 'lower'
  if (viewer.role === 'lead' && taskUserId) return 'any'
  return undefined
}
