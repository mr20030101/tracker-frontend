import { supabase } from './api'
import { sanitiseOrTerm } from './sanitiseOrTerm'
import type { Stage, SubmissionStatus } from '../types'

/** The bootcamp rubric's quality scores, best first. */
export const AUDIT_SCORES = [
  { value: 5, label: 'Perfect', hint: 'No errors (100%)' },
  { value: 4, label: 'Good', hint: '1-3 errors (97%)' },
  { value: 3, label: 'Fixable', hint: 'A few errors (90%)' },
  { value: 2, label: 'Poor', hint: 'Plenty of errors (85%)' },
  { value: 1, label: 'Spam', hint: 'Spam task (80%)' },
] as const

export const STAGE_LABELS: Record<Stage, string> = { attempt: 'Attempt', l0: 'L0', l1: 'L1' }

/** A lead's spot check of a task one of their CBs logged. */
export interface TaskAudit {
  id: number
  task_submission_id: number
  // Filled from the submission by the database.
  cb_user_id: string
  task_id: string
  project_id: number | null
  score: number
  errors: string | null
  audited_by: string | null
  created_at: string
  updated_at: string
  auditor: { id: string; name: string } | null
  project: { id: number; name: string } | null
  submission: { stage: Stage; status: SubmissionStatus; date: string | null } | null
}

export interface TaskAuditInput {
  taskSubmissionId: number
  score: number
  errors: string
}

/** A logged task a lead can pick to audit. */
export interface TaskMatch {
  id: number
  task_id: string
  cb_email: string
  stage: Stage
  status: SubmissionStatus
  date: string | null
  project: { id: number; name: string } | null
}

/** Every audit the caller can see: RLS scopes it to their attached CBs' tasks, or everyone's for an admin. */
export async function fetchTaskAudits(): Promise<TaskAudit[]> {
  const { data, error } = await supabase
    .from('task_audits')
    .select(
      '*, auditor:profiles!task_audits_audited_by_fkey(id, name), project:projects(id, name), submission:task_submissions(stage, status, date)',
    )
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as TaskAudit[]
}

// Above this many matching CBs, the name search is too broad to be useful (and the URL too long).
const MAX_CB_EMAILS = 50

/**
 * Logged tasks whose task ID contains `term`, plus the tasks of `cbEmails` (the CBs whose name or
 * email matched it), newest first; with no term, the latest submitted ones. RLS limits these to the
 * caller's own team's tasks (everyone's for an admin).
 */
export async function searchTaskSubmissions(term: string, cbEmails: string[] = [], limit = 50): Promise<TaskMatch[]> {
  const cleaned = sanitiseOrTerm(term)
  if (!cleaned) return findSubmissions({}, limit)
  const [byTaskId, byCb] = await Promise.all([
    findSubmissions({ taskId: cleaned }, limit),
    cbEmails.length > 0 && cbEmails.length <= MAX_CB_EMAILS ? findSubmissions({ cbEmails }, limit) : Promise.resolve([]),
  ])
  // Task ID matches first: pasting an ID should put that task at the top.
  return [...new Map([...byTaskId, ...byCb].map((t) => [t.id, t])).values()]
}

/** Logged tasks with a task ID containing `taskId`, or by one of `cbEmails`, or else the latest submitted ones. */
async function findSubmissions(filter: { taskId?: string; cbEmails?: string[] }, limit: number): Promise<TaskMatch[]> {
  let query = supabase
    .from('task_submissions')
    .select('id, task_id, cb_email, stage, status, date, project:projects(id, name)')
    .not('task_id', 'is', null)
  if (filter.taskId) query = query.ilike('task_id', `%${filter.taskId}%`)
  else if (filter.cbEmails) query = query.in('cb_email', filter.cbEmails)
  else query = query.eq('status', 'submitted')
  const { data, error } = await query.order('date', { ascending: false, nullsFirst: false }).order('id', { ascending: false }).limit(limit)
  if (error) throw error
  return data as unknown as TaskMatch[]
}

function auditError(error: { code?: string; message: string }): Error {
  // task_submission_id is unique: one audit per task.
  if (error.code === '23505') return new Error('This task has already been audited. Edit that entry instead.')
  return new Error(error.message)
}

export async function addTaskAudit(input: TaskAuditInput, auditorId: string): Promise<void> {
  const { error } = await supabase.from('task_audits').insert({
    task_submission_id: input.taskSubmissionId,
    score: input.score,
    errors: input.errors.trim() || null,
    audited_by: auditorId,
  })
  if (error) throw auditError(error)
}

export async function updateTaskAudit(id: number, input: TaskAuditInput, auditorId: string): Promise<void> {
  const { error } = await supabase
    .from('task_audits')
    .update({
      task_submission_id: input.taskSubmissionId,
      score: input.score,
      errors: input.errors.trim() || null,
      audited_by: auditorId,
    })
    .eq('id', id)
  if (error) throw auditError(error)
}

export async function deleteTaskAudit(id: number): Promise<void> {
  const { error } = await supabase.from('task_audits').delete().eq('id', id)
  if (error) throw error
}
