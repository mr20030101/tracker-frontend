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
  if (!task.timer_started_at) return banked
  return banked + Math.max(0, Math.floor((now - new Date(task.timer_started_at).getTime()) / 1000))
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
