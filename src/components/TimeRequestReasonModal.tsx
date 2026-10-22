import { useState, type ReactNode } from 'react'
import { RotateCw, Save, Send, X } from 'lucide-react'
import { errorMessage } from '../lib/api'
import { Modal } from './Modal'

// The two self-service requests a contributor can send their lead — both end up on the same Scale
// "Reclaim / Extend" form, just with a different request type.
export type TimeRequestType = 'extension' | 'reclaim'
export const TIME_REQUEST_LABELS: Record<TimeRequestType, { noun: string; title: string; description: (task: ReactNode) => ReactNode; placeholder: string }> = {
  extension: {
    noun: 'extension',
    title: 'Request an extension?',
    description: (task) => <>Asks your lead for more time on {task} before it's marked expired.</>,
    placeholder: 'Why do you need more time?',
  },
  reclaim: {
    noun: 'reclaim',
    title: 'Request a reclaim?',
    description: (task) => <>Asks your lead to reclaim {task} back for you.</>,
    placeholder: 'Why does this task need to be reclaimed?',
  },
}

// 'new' sends a first request, 'resend' sends a fresh one after a denial (prefilled with the old
// reason), and 'edit' changes the reason on one that's still pending.
export type TimeRequestMode = 'new' | 'resend' | 'edit'

/** The reason form a contributor fills in to send, resend or edit an extension/reclaim request. */
export function TimeRequestReasonModal({
  type,
  taskId,
  mode,
  initialReason = '',
  isPending,
  error,
  onSubmit,
  onClose,
}: {
  type: TimeRequestType
  taskId: string | null
  mode: TimeRequestMode
  initialReason?: string
  isPending: boolean
  error: unknown
  onSubmit: (reason: string) => void
  onClose: () => void
}) {
  const [reason, setReason] = useState(initialReason)
  const labels = TIME_REQUEST_LABELS[type]
  const title = mode === 'edit' ? `Edit ${labels.noun} request` : mode === 'resend' ? `Resend ${labels.noun} request?` : labels.title

  return (
    <Modal title={title} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-gray-600">
          {mode === 'edit'
            ? 'Your lead sees the new reason straight away. It stays pending.'
            : mode === 'resend'
              ? 'Your last one was denied. This sends your lead a new request.'
              : labels.description(<span className="font-mono text-gray-900">{taskId ?? 'this task'}</span>)}
        </p>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Reason</label>
          <textarea
            rows={3}
            required
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={labels.placeholder}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>
        {Boolean(error) && <div className="text-sm text-status-danger-text">{errorMessage(error, mode === 'edit' ? 'Could not save this request.' : 'Could not send this request.')}</div>}
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600">
            <X className="h-4 w-4" aria-hidden />
            Cancel
          </button>
          <button
            type="button"
            // The lead files this reason with Scale, so a request can't go without one.
            disabled={isPending || reason.trim() === ''}
            onClick={() => onSubmit(reason)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
          >
            {mode === 'edit' ? <Save className="h-4 w-4" aria-hidden /> : mode === 'resend' ? <RotateCw className="h-4 w-4" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
            {mode === 'edit' ? (isPending ? 'Saving...' : 'Save') : isPending ? 'Sending...' : mode === 'resend' ? 'Resend request' : 'Send request'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
