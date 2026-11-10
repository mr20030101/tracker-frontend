import { CircleCheck, CircleDashed, CircleSlash, CircleX, Clock, CloudAlert, TriangleAlert, type LucideIcon } from 'lucide-react'
import type { SubmissionStatus, TaskSubmission } from '../types'

const STATUS: Record<SubmissionStatus, { label: string; icon: LucideIcon; strong?: boolean }> = {
  submitted: { label: 'Submitted', icon: CircleCheck },
  in_progress: { label: 'In Progress', icon: Clock },
  empty: { label: 'Empty', icon: CircleDashed, strong: true },
  expired: { label: 'Expired', icon: CircleSlash },
  claimed_by_another: { label: 'Claimed by Another Person', icon: TriangleAlert, strong: true },
  rejected: { label: 'Rejected/SBQ', icon: CircleX },
}

/** A task's status as a grey icon and its label; the ones that need attention are bold. */
export function StatusPill({ status }: { status: SubmissionStatus }) {
  const { label, icon: Icon, strong } = STATUS[status]
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 text-xs ${strong ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
      <Icon className={`h-4 w-4 ${strong ? 'text-gray-500' : 'text-gray-400'}`} aria-hidden />
      {label}
    </span>
  )
}

// Matches max_tries in retry_task_backup_form() (supabase/migrations/20261110_task_backup_form_retry.sql).
export const BACKUP_FORM_MAX_TRIES = 5

/** Hover text for a failed send: the reason, and whether it's still being retried. */
export function backupFormFailureNote(error: string, attempts: number | null | undefined): string {
  const tries = attempts ?? 0
  const retry =
    tries < BACKUP_FORM_MAX_TRIES
      ? 'It will be tried again automatically within 5 minutes.'
      : `Stopped retrying after ${tries} tries; editing the task tries again.`
  return `${error} ${retry}`
}

/** Shown when a finished task couldn't be sent to the Back Up Task Tracker form; it's retried automatically. */
export function BackupFormFailed({ task }: { task: Pick<TaskSubmission, 'backup_form_sent_at' | 'backup_form_error' | 'backup_form_attempts'> }) {
  if (task.backup_form_sent_at || !task.backup_form_error) return null
  const note = backupFormFailureNote(task.backup_form_error, task.backup_form_attempts)
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-status-danger-text" title={note}>
      <CloudAlert className="h-4 w-4" aria-hidden />
      Not in backup form
      <span className="sr-only">: {note}</span>
    </span>
  )
}
