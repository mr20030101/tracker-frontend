import type { SubmissionStatus } from '../types'

const STYLES: Record<SubmissionStatus, string> = {
  submitted: 'bg-status-success-bg text-status-success-text',
  in_progress: 'bg-status-warning-bg text-status-warning-text',
  empty: 'bg-status-danger-bg text-status-danger-text',
}

const LABELS: Record<SubmissionStatus, string> = {
  submitted: 'Submitted',
  in_progress: 'In Progress',
  empty: 'Empty',
}

export function StatusPill({ status }: { status: SubmissionStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLES[status]}`}>
      {LABELS[status]}
    </span>
  )
}
