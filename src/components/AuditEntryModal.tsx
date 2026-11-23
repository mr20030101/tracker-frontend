import { useId, useState } from 'react'
import { Save, Trash2, X } from 'lucide-react'
import { errorMessage } from '../lib/api'
import { AUDIT_SCORES, type TaskAudit, type TaskAuditInput } from '../lib/taskAudits'
import { Modal } from './Modal'
import { Select } from './Select'

const fieldClass = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent'
const labelClass = 'mb-1.5 block text-sm font-medium text-gray-700'

// The chosen score's colours: green for good work, amber for fixable, red for poor and spam.
function scoreTone(score: number): string {
  if (score >= 4) return 'border-status-success-text bg-status-success-bg text-status-success-text'
  if (score === 3) return 'border-status-warning-text bg-status-warning-bg text-status-warning-text'
  return 'border-status-danger-text bg-status-danger-bg text-status-danger-text'
}

// Adding or editing an audit on the Audits page. Everything is typed in: the person may have no
// Tracker account, and the task needn't be in the Task Log. The project is one the lead runs.
export function AuditEntryModal({
  projects,
  nameSuggestions,
  existing,
  isPending,
  error,
  onSave,
  onDelete,
  onClose,
}: {
  /** The projects the caller can audit on: a lead's own, or every one for an admin. */
  projects: { id: number; name: string }[]
  /** Names offered while typing: the team's CBs and people audited before. */
  nameSuggestions: string[]
  existing: TaskAudit | null
  isPending: boolean
  error: unknown
  onSave: (input: TaskAuditInput) => void
  onDelete: () => void
  onClose: () => void
}) {
  const nameListId = useId()
  // An older audit's project may not be one the caller runs; it's still shown until they change it.
  const projectOptions = [
    ...projects.map((p) => ({ value: String(p.id), label: p.name })),
    ...(existing?.project && !projects.some((p) => p.id === existing.project!.id)
      ? [{ value: String(existing.project.id), label: existing.project.name }]
      : []),
  ]
  const [form, setForm] = useState({
    cbName: existing?.cb_name ?? '',
    taskId: existing?.task_id ?? '',
    projectId: existing?.project_id ? String(existing.project_id) : projects.length === 1 ? String(projects[0].id) : '',
    score: existing?.score ?? 0,
    errors: existing?.errors ?? '',
  })

  const complete = form.cbName.trim() !== '' && form.taskId.trim() !== '' && form.projectId !== '' && form.score > 0
  const chosenScore = AUDIT_SCORES.find((s) => s.value === form.score)

  return (
    <Modal title={existing ? 'Edit audit' : 'Add audit'} onClose={onClose} maxWidthClassName="max-w-2xl">
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault()
          if (!complete) return
          onSave({ cbName: form.cbName, taskId: form.taskId, projectId: Number(form.projectId), score: form.score, errors: form.errors })
        }}
      >
        <div>
          <label htmlFor="audit-name" className={labelClass}>
            Person audited
          </label>
          <input
            id="audit-name"
            list={nameListId}
            value={form.cbName}
            onChange={(e) => setForm({ ...form, cbName: e.target.value })}
            maxLength={200}
            autoComplete="off"
            placeholder="Their name"
            className={fieldClass}
          />
          <datalist id={nameListId}>
            {nameSuggestions.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="audit-task-id" className={labelClass}>
              Task ID
            </label>
            <input
              id="audit-task-id"
              value={form.taskId}
              onChange={(e) => setForm({ ...form, taskId: e.target.value })}
              maxLength={200}
              autoComplete="off"
              placeholder="e.g. 6aa34905fe8d09b156e1ef4d"
              className={`${fieldClass} font-mono`}
            />
          </div>
          <div>
            <span className={labelClass}>Project</span>
            <Select
              fullWidth
              value={form.projectId}
              onChange={(projectId) => setForm({ ...form, projectId })}
              options={projectOptions}
              placeholder={projects.length === 0 ? 'You have no projects' : 'Choose a project...'}
              aria-label="Project"
              className={fieldClass}
            />
          </div>
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
            Only admins and the project's leads see audits.
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
            className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
          >
            <Save className="h-4 w-4" aria-hidden />
            {isPending ? 'Saving...' : existing ? 'Save' : 'Add audit'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
