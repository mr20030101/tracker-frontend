import { supabase } from './api'
import type { FeedbackStatus, TaskFeedback } from '../types'

export type TaskFeedbackWithPeople = TaskFeedback & {
  contributor: { id: string; name: string; email: string } | null
  // Null while pending, or when the viewer isn't allowed to read the reviewer's profile.
  reviewer: { id: string; name: string } | null
}

/**
 * Every feedback report the caller can see: RLS scopes this to their own (a contributor), their
 * attached contributors' and their own (a lead), or everyone's (an admin).
 */
export async function fetchTaskFeedback(): Promise<TaskFeedbackWithPeople[]> {
  const { data, error } = await supabase
    .from('task_feedback')
    .select(
      '*, contributor:profiles!task_feedback_user_id_fkey(id, name, email), reviewer:profiles!task_feedback_reviewed_by_fkey(id, name)',
    )
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as TaskFeedbackWithPeople[]
}

/** How many reports are waiting to be checked, out of the ones the caller can see. */
export async function fetchPendingFeedbackCount(): Promise<number> {
  const { count, error } = await supabase
    .from('task_feedback')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
  if (error) throw error
  return count ?? 0
}

export async function fileTaskFeedback(params: {
  userId: string
  taskId: string
  screenshotUrl: string
  remarks: string
}): Promise<void> {
  const { error } = await supabase.from('task_feedback').insert({
    user_id: params.userId,
    task_id: params.taskId.trim(),
    screenshot_url: params.screenshotUrl.trim(),
    cb_remarks: params.remarks.trim() || null,
  })
  if (error) throw error
}

/** A lead's (or admin's) check: valid or invalid, with optional remarks. Can be redone. */
export async function reviewTaskFeedback(
  id: number,
  status: Exclude<FeedbackStatus, 'pending'>,
  remarks: string,
): Promise<void> {
  const { error } = await supabase.rpc('review_task_feedback', { p_id: id, p_status: status, p_remarks: remarks })
  if (error) throw error
}

/** Withdraws (a contributor's own pending one) or deletes (a lead/admin) a report. */
export async function deleteTaskFeedback(id: number): Promise<void> {
  const { error } = await supabase.from('task_feedback').delete().eq('id', id)
  if (error) throw error
}
