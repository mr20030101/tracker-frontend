import { supabase } from './api'
import type { Stage, SubmissionStatus } from '../types'

/** The bootcamp rubric's quality scores, best first. */
export const AUDIT_SCORES = [
  { value: 5, label: 'Perfect', hint: 'No errors (100%)' },
  { value: 4, label: 'Good', hint: '1-3 errors (97%)' },
  { value: 3, label: 'Fixable', hint: 'A few errors (90%)' },
  { value: 2, label: 'Poor', hint: 'Plenty of errors (85%)' },
  { value: 1, label: 'Spam', hint: 'Spam task (80%)' },
] as const

export const STAGE_LABELS: Record<Stage, string> = { attempt: 'Attempt', l0: 'L0', l1: 'L1', l10: 'L10' }

/**
 * A lead's spot check of a task: the task ID and the person's name are typed in, so the person
 * needn't have a Tracker account. Older audits, made from a logged task, also carry the CB's
 * profile and the submission.
 */
export interface TaskAudit {
  id: number
  task_submission_id: number | null
  cb_user_id: string | null
  cb_name: string
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
  cbName: string
  taskId: string
  projectId: number
  score: number
  errors: string
}

/**
 * Every audit the caller can see: an admin, all of them; a lead, the ones on their projects, the
 * ones they saved and older ones of their own CBs (see 20261123_free_audits.sql).
 */
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

function auditRow(input: TaskAuditInput, auditorId: string) {
  return {
    cb_name: input.cbName.trim(),
    task_id: input.taskId.trim(),
    project_id: input.projectId,
    score: input.score,
    errors: input.errors.trim() || null,
    audited_by: auditorId,
  }
}

function auditError(error: { code?: string; message: string }): Error {
  // Row-level security: the project isn't one the caller runs.
  if (error.code === '42501') return new Error("You can only audit on your own projects.")
  return new Error(error.message)
}

export async function addTaskAudit(input: TaskAuditInput, auditorId: string): Promise<void> {
  const { error } = await supabase.from('task_audits').insert(auditRow(input, auditorId))
  if (error) throw auditError(error)
}

export async function updateTaskAudit(id: number, input: TaskAuditInput, auditorId: string): Promise<void> {
  const { error } = await supabase.from('task_audits').update(auditRow(input, auditorId)).eq('id', id)
  if (error) throw auditError(error)
}

export async function deleteTaskAudit(id: number): Promise<void> {
  const { error } = await supabase.from('task_audits').delete().eq('id', id)
  if (error) throw error
}
