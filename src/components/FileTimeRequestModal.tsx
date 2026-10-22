import { useState } from 'react'
import { ExternalLink, X } from 'lucide-react'
import { buildExtensionRequestFormUrl } from '../lib/taskRequests'
import type { Stage } from '../types'
import { Modal } from './Modal'

export interface TimeRequestFormFields {
  requestType: 'Extend' | 'Reclaim'
  taskId: string | null
  cbEmail: string | null
  remotaskId: string | null
  stage: Stage | null
  projectName: string | null
  reason: string | null
}

const inputClass = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent'

// What a lead sees on "Request" for an extension or reclaim: the details that go on the Scale
// "Reclaim / Extend" form, prefilled from the request and editable, so nothing is filed until
// they've checked it. "Open form" opens the form with these and calls onFiled (which marks the
// request approved). The edits only go on the form; the request itself keeps what was sent.
export function FileTimeRequestModal({
  initial,
  onFiled,
  onClose,
}: {
  initial: TimeRequestFormFields
  onFiled: () => void
  onClose: () => void
}) {
  const [fields, setFields] = useState(initial)
  const set = <K extends keyof TimeRequestFormFields>(key: K, value: TimeRequestFormFields[K]) => setFields((prev) => ({ ...prev, [key]: value }))
  const text = (value: string) => (value.trim() === '' ? null : value)

  return (
    <Modal title={`File ${fields.requestType === 'Reclaim' ? 'reclaim' : 'extension'} request`} onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          window.open(buildExtensionRequestFormUrl({ ...fields, reason: fields.reason?.trim() || null }), '_blank', 'noopener,noreferrer')
          onFiled()
          onClose()
        }}
      >
        <p className="text-sm text-gray-600">Check the details, then open the Scale form with them filled in. It's marked approved once the form opens.</p>
        <div>
          <span className="mb-1 block text-sm font-medium text-gray-700">Request type</span>
          <div className="flex gap-2">
            {(['Extend', 'Reclaim'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => set('requestType', option)}
                aria-pressed={fields.requestType === option}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                  fields.requestType === option ? 'border-accent bg-accent text-accent-foreground' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Task ID</span>
          <input value={fields.taskId ?? ''} onChange={(e) => set('taskId', text(e.target.value))} className={`${inputClass} font-mono`} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Remotask ID</span>
          <input value={fields.remotaskId ?? ''} onChange={(e) => set('remotaskId', text(e.target.value))} className={`${inputClass} font-mono`} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">Reason</span>
          <textarea rows={3} maxLength={500} value={fields.reason ?? ''} onChange={(e) => set('reason', e.target.value)} className={inputClass} />
        </label>
        <p className="text-xs text-gray-400">
          {[fields.cbEmail, fields.projectName, fields.stage?.toUpperCase()].filter(Boolean).join(' · ')}
        </p>
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600">
            <X className="h-4 w-4" aria-hidden />
            Cancel
          </button>
          <button type="submit" className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground">
            <ExternalLink className="h-4 w-4" aria-hidden />
            Open form
          </button>
        </div>
      </form>
    </Modal>
  )
}
