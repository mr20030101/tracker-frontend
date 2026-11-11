import { sanitiseOrTerm } from './sanitiseOrTerm'
import { supabase } from './api'
import type { FeedbackStatus, TaskFeedback } from '../types'

export type TaskFeedbackWithPeople = TaskFeedback & {
  contributor: { id: string; name: string; email: string } | null
  // Null while pending, or when the viewer isn't allowed to read the reviewer's profile.
  reviewer: { id: string; name: string } | null
}

const FEEDBACK_SELECT =
  '*, contributor:profiles!task_feedback_user_id_fkey(id, name, email), reviewer:profiles!task_feedback_reviewed_by_fkey(id, name)'

// A search matches the Task ID, or the contributor's name or email: those are on profiles, so the
// matching people are looked up first and their reports included.
// (Returns the filter, not the query: awaiting a Supabase query would run it.)
async function searchFilter(search: string): Promise<string | null> {
  const term = sanitiseOrTerm(search.trim())
  if (!term) return null
  const { data: people } = await supabase.from('profiles').select('id').or(`name.ilike.%${term}%,email.ilike.%${term}%`).limit(200)
  const ids = (people ?? []).map((p) => p.id as string)
  return ids.length ? `task_id.ilike.%${term}%,user_id.in.(${ids.join(',')})` : `task_id.ilike.%${term}%`
}

/** One page of feedback reports, newest first, filtered by status and search on the server. */
export async function fetchTaskFeedbackPage(params: {
  status: FeedbackStatus | 'all'
  search: string
  page: number
  pageSize: number
}): Promise<{ rows: TaskFeedbackWithPeople[]; total: number }> {
  const filter = await searchFilter(params.search)
  let query = supabase.from('task_feedback').select(FEEDBACK_SELECT, { count: 'exact' })
  if (params.status !== 'all') query = query.eq('status', params.status)
  if (filter) query = query.or(filter)
  const from = (params.page - 1) * params.pageSize
  const { data, error, count } = await query.order('created_at', { ascending: false }).order('id', { ascending: false }).range(from, from + params.pageSize - 1)
  if (error) throw error
  return { rows: data as TaskFeedbackWithPeople[], total: count ?? 0 }
}

/** Reports in each status (and overall) for this search, counted without downloading them. */
export async function fetchFeedbackStatusCounts(search: string): Promise<Record<FeedbackStatus | 'all', number>> {
  const filter = await searchFilter(search)
  const countFor = async (status: FeedbackStatus | 'all') => {
    let query = supabase.from('task_feedback').select('id', { count: 'exact', head: true })
    if (status !== 'all') query = query.eq('status', status)
    if (filter) query = query.or(filter)
    const { count, error } = await query
    if (error) throw error
    return count ?? 0
  }
  const [all, pending, valid, invalid] = await Promise.all([countFor('all'), countFor('pending'), countFor('valid'), countFor('invalid')])
  return { all, pending, valid, invalid }
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
