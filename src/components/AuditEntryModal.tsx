import { useState } from 'react'
import { Save, Trash2, X } from 'lucide-react'
import { errorMessage } from '../lib/api'
import { AUDIT_SCORES, type TaskAudit, type TaskAuditInput, type TaskMatch } from '../lib/taskAudits'
import type { User } from '../types'
import { Modal } from './Modal'
import { TaskPicker } from './TaskPicker'

const fieldClass = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent'
const labelClass = 'mb-1.5 block text-sm font-medium text-gray-700'

// The chosen score's colours: green for good work, amber for fixable, red for poor and spam.
function scoreTone(score: number): string {
  if (score >= 4) return 'border-status-success-text bg-status-success-bg text-status-success-text'
  if (score === 3) return 'border-status-warning-text bg-status-warning-bg text-status-warning-text'
  return 'border-status-danger-text bg-status-danger-bg text-status-danger-text'
}

// Adding or editing a lead's audit of one of their CBs' tasks on the Audits page.
export function AuditEntryModal({
  team,
  auditedIds,
  existing,
  isPending,
  error,
  onSave,
  onDelete,
  onClose,
}: {
  team: User[]
  /** Submissions that already have an audit (not counting the one being edited). */
  auditedIds: Set<number>
  existing: TaskAudit | null
  isPending: boolean
  error: unknown
  onSave: (input: TaskAuditInput) => void
  onDelete: () => void
  onClose: () => void
}) {
  // The audited task, rebuilt from the audit when editing one.
  const [task, setTask] = useState<TaskMatch | null>(() => {
    const cb = existing && team.find((u) => u.id === existing.cb_user_id)
    if (!existing || !cb || !existing.submission) return null
    return {
      id: existing.task_submission_id,
      task_id: existing.task_id,
      cb_email: cb.email,
      stage: existing.submission.stage,
      status: existing.submission.status,
      date: existing.submission.date,
      project: existing.project,
    }
  })
  const [form, setForm] = useState({ score: existing?.score ?? 0, errors: existing?.errors ?? '' })

  const complete = task !== null && form.score > 0
  const chosenScore = AUDIT_SCORES.find((s) => s.value === form.score)

  return (
    <Modal title={existing ? 'Edit audit' : 'Add audit'} onClose={onClose} maxWidthClassName="max-w-2xl">
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault()
          if (!task || !complete) return
          onSave({ taskSubmissionId: task.id, score: form.score, errors: form.errors })
        }}
      >
        <div>
          <span className={labelClass}>Task</span>
          <TaskPicker value={task} onChange={setTask} team={team} auditedIds={auditedIds} />
        </div>

        <div>
          <span className={labelClass}>Quality score</span>
          <div role="radiogroup" aria-label="Quality score" className="grid grid-cols-5 gap-2">
            {AUDIT_SCORES.map((s) => {
              const chosen = form.score === s.value
              return (
                <button
                  key={s.value}
                  type="button"
                  role="radio"
                  aria-checked={chosen}
                  title={s.hint}
                  onClick={() => setForm({ ...form, score: s.value })}
                  className={`flex flex-col items-center rounded-lg border px-1 py-2 ${
                    chosen ? scoreTone(s.value) : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <span className="text-lg font-bold leading-none">{s.value}</span>
                  <span className="mt-1 text-xs">{s.label}</span>
                </button>
              )
            })}
          </div>
          <div className="mt-1.5 h-4 text-xs text-gray-500">{chosenScore?.hint}</div>
        </div>

        <div>
          <label htmlFor="audit-errors" className={labelClass}>
            Errors found <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <textarea
            id="audit-errors"
            rows={4}
            maxLength={2000}
            value={form.errors}
            onChange={(e) => setForm({ ...form, errors: e.target.value })}
            placeholder={'One per line, e.g.\nMissed the pedestrian at 0:12\nWrong label on frame 40'}
            className={fieldClass}
          />
          <div className="mt-1 text-xs text-gray-400">
            Only the CB's lead and admins see audits.
            {existing?.auditor && ` Last saved by ${existing.auditor.name}, ${new Date(existing.updated_at).toLocaleString()}.`}
          </div>
        </div>

        {Boolean(error) && <div className="text-sm text-status-danger-text">{errorMessage(error, 'Could not save this audit.')}</div>}

        <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-4">
          {existing && (
            <button
              type="button"
              disabled={isPending}
              onClick={onDelete}
              className="mr-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-status-danger-text hover:bg-status-danger-bg disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              Delete
            </button>
          )}
          <button type="button" onClick={onClose} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600">
            <X className="h-4 w-4" aria-hidden />
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending || !complete}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
          >
            <Save className="h-4 w-4" aria-hidden />
            {isPending ? 'Saving...' : existing ? 'Save' : 'Add audit'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
