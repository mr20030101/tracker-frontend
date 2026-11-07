import { CircleCheck, CircleDashed, CircleSlash, Clock, TriangleAlert, type LucideIcon } from 'lucide-react'
import type { SubmissionStatus } from '../types'

const STATUS: Record<SubmissionStatus, { label: string; icon: LucideIcon; strong?: boolean }> = {
  submitted: { label: 'Submitted', icon: CircleCheck },
  in_progress: { label: 'In Progress', icon: Clock },
  empty: { label: 'Empty', icon: CircleDashed, strong: true },
  expired: { label: 'Expired', icon: CircleSlash },
  claimed_by_another: { label: 'Claimed by Another Person', icon: TriangleAlert, strong: true },
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
