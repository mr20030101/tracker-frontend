import { supabase } from './api'
import type { ExtensionRequest, ExtensionRequestStatus } from '../types'

export interface ExtensionRequestWithContext extends ExtensionRequest {
  task_submission: {
    id: number
    task_id: string | null
    date: string | null
    status: string
    cb_email: string
    project: { name: string } | null
  } | null
  requester: { id: string; name: string; email: string; remotasks_id: string | null } | null
}

/**
 * Every extension request the caller can see: RLS scopes this to their own (a contributor),
 * their attached contributors' (a lead), or everyone's (an admin) — same rule as task_submissions.
 */
export async function fetchExtensionRequests(): Promise<ExtensionRequestWithContext[]> {
  const { data, error } = await supabase
    .from('task_extension_requests')
    .select(
      '*, task_submission:task_submissions(id, task_id, date, status, cb_email, project:projects(name)), requester:profiles!task_extension_requests_requested_by_fkey(id, name, email, remotasks_id)',
    )
    .order('requested_at', { ascending: false })
  if (error) throw error
  return data as ExtensionRequestWithContext[]
}

export async function requestExtension(submissionId: number, requestedBy: string, reason: string): Promise<void> {
  const { error } = await supabase.from('task_extension_requests').insert({
    task_submission_id: submissionId,
    requested_by: requestedBy,
    reason: reason.trim() || null,
  })
  if (error) throw error
}

/** Only while still pending — enforced by RLS as well, this just avoids a confusing round-trip. */
export async function withdrawExtensionRequest(id: number): Promise<void> {
  const { error } = await supabase.from('task_extension_requests').delete().eq('id', id)
  if (error) throw error
}

export async function reviewExtensionRequest(
  id: number,
  status: Extract<ExtensionRequestStatus, 'approved' | 'denied'>,
  reviewedBy: string,
): Promise<void> {
  const { error } = await supabase
    .from('task_extension_requests')
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
export async function reviewExtensionRequestsBulk(
  ids: number[],
  status: Extract<ExtensionRequestStatus, 'approved' | 'denied'>,
  reviewedBy: string,
): Promise<BulkResult> {
  return runBulk(ids, (id) => reviewExtensionRequest(id, status, reviewedBy))
}

/** Deletes (a lead/admin) or withdraws (a contributor's own pending ones) several requests at once. See runBulk. */
export async function deleteExtensionRequestsBulk(ids: number[]): Promise<BulkResult> {
  return runBulk(ids, withdrawExtensionRequest)
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
