import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ExternalLink, X } from 'lucide-react'
import {
  buildExtensionRequestFormUrl,
  buildRstExtensionFormUrl,
  buildTaskIssuesFormUrl,
  fetchCbLeadName,
  timeRequestFormFor,
  type TimeRequestForm,
} from '../lib/taskRequests'
import type { Stage } from '../types'
import { Modal } from './Modal'

export interface TimeRequestFormFields {
  requestType: 'Extend' | 'Reclaim'
  taskId: string | null
  cbEmail: string | null
  remotaskId: string | null
  stage: Stage | null
  projectName: string | null
  projectCode: string | null
  reason: string | null
}

const FORM_NAMES: Record<TimeRequestForm, string> = {
  scale: 'Scale form',
  rst: 'RST extension form',
  task_issues: 'TASK ISSUES form',
}

const inputClass = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent'

// What a lead sees on "Request" for an extension or reclaim: the details that go on the Scale
// "Reclaim / Extend" form, prefilled from the request and editable, so nothing is filed until
// they've checked it. "Open form" opens the form with these and calls onFiled (which marks the
// request approved). The edits only go on the form; the request itself keeps what was sent.
// The task's project picks the form (timeRequestFormFor): the RST and TASK ISSUES forms take
// different details, so only the ones the chosen form uses are shown.
export function FileTimeRequestModal({
  initial,
  cbUserId,
  onFiled,
  onClose,
}: {
  initial: TimeRequestFormFields
  /** The contributor the request is for: their lead goes on the Scale form. */
  cbUserId: string | null
  onFiled: () => void
  onClose: () => void
}) {
  const [fields, setFields] = useState(initial)
  const form = timeRequestFormFor({ name: fields.projectName ?? '', code: fields.projectCode })
  const lead = useQuery({
    queryKey: ['cb-lead-name', cbUserId],
    queryFn: () => fetchCbLeadName(cbUserId!),
    enabled: !!cbUserId && form === 'scale',
    staleTime: 5 * 60_000,
  })
  const ready = form !== 'scale' || !cbUserId || !lead.isPending
  const set = <K extends keyof TimeRequestFormFields>(key: K, value: TimeRequestFormFields[K]) => setFields((prev) => ({ ...prev, [key]: value }))
  const text = (value: string) => (value.trim() === '' ? null : value)

  return (
    <Modal title={`File ${fields.requestType === 'Reclaim' ? 'reclaim' : 'extension'} request`} onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (!ready) return
          const reason = fields.reason?.trim() || null
          const url =
            form === 'rst'
              ? buildRstExtensionFormUrl({ ...fields, reason })
              : form === 'task_issues'
                ? buildTaskIssuesFormUrl({ ...fields, reason })
                : buildExtensionRequestFormUrl({ ...fields, reason, leadName: lead.data ?? null })
          window.open(url, '_blank', 'noopener,noreferrer')
          onFiled()
          onClose()
        }}
      >
        <p className="text-sm text-gray-600">
          Check the details, then open the {FORM_NAMES[form]} with them filled in. It{'\u2019'}s marked approved once the form opens.
          {form === 'task_issues' && ' Pick the reason category on the form.'}
        </p>
        {form !== 'rst' && (
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
        )}
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">{form === 'task_issues' ? 'Task ID (the form’s Scene ID)' : 'Task ID'}</span>
          <input value={fields.taskId ?? ''} onChange={(e) => set('taskId', text(e.target.value))} className={`${inputClass} font-mono`} />
        </label>
        {form !== 'rst' && (
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Remotask ID</span>
            <input value={fields.remotaskId ?? ''} onChange={(e) => set('remotaskId', text(e.target.value))} className={`${inputClass} font-mono`} />
          </label>
        )}
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
          <button type="submit" aria-busy={!ready} className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground">
            <ExternalLink className="h-4 w-4" aria-hidden />
            {ready ? 'Open form' : 'Loading...'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
