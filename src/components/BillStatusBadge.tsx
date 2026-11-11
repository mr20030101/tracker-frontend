import type { BillStatus } from '../lib/billing'

const STATUS_PILL: Record<BillStatus, { label: string; className: string }> = {
  paid: { label: 'Paid', className: 'bg-status-success-bg text-status-success-text' },
  unpaid: { label: 'Unpaid', className: 'bg-status-neutral-bg text-status-neutral-text' },
  overdue: { label: 'Overdue', className: 'bg-status-danger-bg text-status-danger-text' },
}

export function BillStatusBadge({ status }: { status: BillStatus }) {
  const { label, className } = STATUS_PILL[status]
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${className}`}>{label}</span>
}
