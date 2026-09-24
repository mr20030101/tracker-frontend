import { supabase } from './api'
import type { RequestStatus, TaskRequest } from '../types'

// TaskRequest is a union (ExtensionTaskRequest | BadVideoTaskRequest) — an interface can't
// `extends` a union (only object types/intersections), so this intersects instead. That still
// distributes correctly: TaskRequestWithContext is itself
// (ExtensionTaskRequest & Context) | (BadVideoTaskRequest & Context), so `type` still narrows it.
export type TaskRequestWithContext = TaskRequest & {
  task_submission: {
    id: number
    task_id: string | null
    date: string | null
    status: string
    cb_email: string
    project: { name: string } | null
  } | null
  requester: { id: string; name: string; email: string; remotasks_id: string | null } | null
  // Null while pending, or when the viewer isn't allowed to read the reviewer's profile.
  reviewer: { id: string; name: string } | null
}

/**
 * Every request (extension or bad video) the caller can see: RLS scopes this to their own (a
 * contributor's extension requests), their attached contributors' (a lead), whichever task's
 * contributor they're attached to (a bad video report about that contributor's work), or
 * everyone's (an admin).
 */
export async function fetchTaskRequests(): Promise<TaskRequestWithContext[]> {
  const { data, error } = await supabase
    .from('task_requests')
    .select(
      // The FK constraint keeps its pre-rename name (task_extension_requests_requested_by_fkey) —
      // renaming DB constraint names was deliberately left out of the table rename for minimal risk.
      '*, task_submission:task_submissions(id, task_id, date, status, cb_email, project:projects(name)), requester:profiles!task_extension_requests_requested_by_fkey(id, name, email, remotasks_id), reviewer:profiles!task_extension_requests_reviewed_by_fkey(id, name)',
    )
    .order('requested_at', { ascending: false })
  if (error) throw error
  return data as TaskRequestWithContext[]
}

/**
 * How many requests are waiting on a decision, out of the ones the caller can see — the same set
 * (and so the same number) as the Requests page's Pending tab, without downloading the rows.
 */
export async function fetchPendingRequestCount(): Promise<number> {
  const { count, error } = await supabase
    .from('task_requests')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
  if (error) throw error
  return count ?? 0
}

export async function requestExtension(submissionId: number, requestedBy: string, reason: string): Promise<void> {
  const { error } = await supabase.from('task_requests').insert({
    type: 'extension',
    task_submission_id: submissionId,
    requested_by: requestedBy,
    reason: reason.trim() || null,
  })
  if (error) throw error
}

export async function reportBadVideo(params: {
  submissionId: number
  requestedBy: string
  category: string
  frame: string
  workforce: 'REMOTE' | 'ONSITE'
  workforceName: string
}): Promise<void> {
  const { error } = await supabase.from('task_requests').insert({
    type: 'bad_video',
    task_submission_id: params.submissionId,
    requested_by: params.requestedBy,
    bad_video_category: params.category,
    bad_video_frame: params.frame,
    bad_video_workforce: params.workforce,
    bad_video_workforce_name: params.workforceName,
  })
  if (error) throw error
}

/** Only while still pending — enforced by RLS as well, this just avoids a confusing round-trip. */
export async function deleteTaskRequest(id: number): Promise<void> {
  const { error } = await supabase.from('task_requests').delete().eq('id', id)
  if (error) throw error
}

export async function reviewTaskRequest(
  id: number,
  status: Extract<RequestStatus, 'approved' | 'denied'>,
  reviewedBy: string,
): Promise<void> {
  const { error } = await supabase
    .from('task_requests')
    .update({ status, reviewed_by: reviewedBy, reviewed_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export interface BulkResult {
  updated: number[]
  failed: { id: number; error: string }[]
}

/** Runs `run` on each id in parallel for a "select all, then..." bulk action. One failing id
 * doesn't stop the rest; `failed` says which ones didn't go through, so just those can be retried. */
async function runBulk(ids: number[], run: (id: number) => Promise<void>): Promise<BulkResult> {
  const results = await Promise.allSettled(ids.map(run))
  const updated: number[] = []
  const failed: { id: number; error: string }[] = []
  results.forEach((result, index) => {
    const id = ids[index]
    if (result.status === 'fulfilled') updated.push(id)
    else failed.push({ id, error: result.reason instanceof Error ? result.reason.message : String(result.reason) })
  })
  return { updated, failed }
}

/** Approves or denies several requests at once. See runBulk. */
export async function reviewTaskRequestsBulk(
  ids: number[],
  status: Extract<RequestStatus, 'approved' | 'denied'>,
  reviewedBy: string,
): Promise<BulkResult> {
  return runBulk(ids, (id) => reviewTaskRequest(id, status, reviewedBy))
}

/** Deletes (a lead/admin) or withdraws (a contributor's own pending ones) several requests at once. See runBulk. */
export async function deleteTaskRequestsBulk(ids: number[]): Promise<BulkResult> {
  return runBulk(ids, deleteTaskRequest)
}

// The Scale "Reclaim / Extend Request Form" a lead files with Remotasks itself once they've
// decided to approve — the actual mechanism that gets the contributor more time. Its own
// question ids, from the form's rendered HTML (Google Forms doesn't expose these any other way).
const EXTENSION_REQUEST_FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSe22XIQhzW65LsEe2Bf2v7hf2XqduZ8pxx0wJlMcDM4E9Kw5w/viewform'
const EXTENSION_FORM_ENTRY = {
  taskId: 'entry.1386331886',
  cbEmail: 'entry.157628758',
  remotaskId: 'entry.1874333467',
  requestType: 'entry.1650689703',
  reason: 'entry.654618638',
  supportName: 'entry.1875363957',
}

/** A link to the Reclaim/Extend form with as much of it prefilled as we have on hand. */
export function buildExtensionRequestFormUrl(params: {
  taskId: string | null
  cbEmail: string | null
  remotaskId: string | null
  reason: string | null
  supportName: string
}): string {
  const query = new URLSearchParams({ usp: 'pp_url' })
  if (params.taskId) query.set(EXTENSION_FORM_ENTRY.taskId, params.taskId)
  if (params.cbEmail) query.set(EXTENSION_FORM_ENTRY.cbEmail, params.cbEmail)
  if (params.remotaskId) query.set(EXTENSION_FORM_ENTRY.remotaskId, params.remotaskId)
  query.set(EXTENSION_FORM_ENTRY.requestType, 'Extend')
  if (params.reason) query.set(EXTENSION_FORM_ENTRY.reason, params.reason)
  if (params.supportName) query.set(EXTENSION_FORM_ENTRY.supportName, params.supportName)
  return `${EXTENSION_REQUEST_FORM_URL}?${query.toString()}`
}

// The "Bad Video Validation/Removal" form (ALOHA | URSA | YAM) a lead/admin files once they've
// decided a flagged task's video really does need removal/validation — same mechanism as the
// extension form above: open it prefilled, in a new tab, and mark the request approved here.
const BAD_VIDEO_FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSf6hU9Vif1-aTiohFR05MFrY2eGL_ssGAZ3AyE9z4Pz_p31hA/viewform'
const BAD_VIDEO_FORM_ENTRY = {
  cbEmail: 'entry.1465994475',
  taskId: 'entry.717075657',
  category: 'entry.1032488088',
  frame: 'entry.1882040546',
  supportName: 'entry.221862037',
  workforceName: 'entry.701886437',
  workforce: 'entry.8749894',
}

/** A link to the Bad Video Validation/Removal form with this report's details prefilled. */
export function buildBadVideoRequestFormUrl(params: {
  cbEmail: string | null
  taskId: string | null
  category: string
  frame: string
  workforce: 'REMOTE' | 'ONSITE'
  workforceName: string
  supportName: string
}): string {
  const query = new URLSearchParams({ usp: 'pp_url' })
  if (params.cbEmail) query.set(BAD_VIDEO_FORM_ENTRY.cbEmail, params.cbEmail)
  if (params.taskId) query.set(BAD_VIDEO_FORM_ENTRY.taskId, params.taskId)
  query.set(BAD_VIDEO_FORM_ENTRY.category, params.category)
  query.set(BAD_VIDEO_FORM_ENTRY.frame, params.frame)
  query.set(BAD_VIDEO_FORM_ENTRY.workforce, params.workforce)
  query.set(BAD_VIDEO_FORM_ENTRY.workforceName, params.workforceName)
  if (params.supportName) query.set(BAD_VIDEO_FORM_ENTRY.supportName, params.supportName)
  return `${BAD_VIDEO_FORM_URL}?${query.toString()}`
}
