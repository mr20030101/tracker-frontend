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

/** Shown when a finished task couldn't be sent to the Back Up Task Tracker form; editing the task retries it. */
export function BackupFormFailed({ task }: { task: Pick<TaskSubmission, 'backup_form_sent_at' | 'backup_form_error'> }) {
  if (task.backup_form_sent_at || !task.backup_form_error) return null
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-status-danger-text" title={task.backup_form_error}>
      <CloudAlert className="h-4 w-4" aria-hidden />
      Not in backup form
      <span className="sr-only">: {task.backup_form_error}</span>
    </span>
  )
}
