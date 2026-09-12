import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { Project, Stage, SubmissionStatus, TaskSubmission } from '../types'
import { Modal } from './Modal'

const MANAGER_ROLES = ['admin', 'lead']

interface Props {
  submission?: TaskSubmission
  onClose: () => void
}

function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const message = (err as { message?: unknown }).message
    if (typeof message === 'string' && message) return message
  }
  return 'Could not save this entry. Check the fields and try again.'
}

const emptyForm = {
  cb_email: '',
  task_id: '',
  project_id: '',
  new_project: '',
  stage: 'attempt' as Stage,
  status: 'in_progress' as SubmissionStatus,
  date: new Date().toISOString().slice(0, 10),
  notes: '',
}

export function TaskSubmissionForm({ submission, onClose }: Props) {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const isManager = Boolean(user && MANAGER_ROLES.includes(user.role))
  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => (await api.get<Project[]>('/projects')).data,
  })

  const [form, setForm] = useState(
    submission
      ? {
          cb_email: submission.cb_email,
          task_id: submission.task_id ?? '',
          project_id: submission.project_id ? String(submission.project_id) : '',
          new_project: '',
          stage: submission.stage,
          status: submission.status,
          date: submission.date?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
          notes: submission.notes ?? '',
        }
      : { ...emptyForm, cb_email: isManager ? '' : (user?.email ?? '') },
  )
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: async () => {
      let projectId = form.project_id ? Number(form.project_id) : null

      if (isManager && !projectId && form.new_project.trim()) {
        const res = await api.post<Project>('/projects', { name: form.new_project.trim() })
        projectId = res.data.id
      }

      const payload = {
        cb_email: form.cb_email,
        task_id: form.task_id || null,
        project_id: projectId,
        stage: form.stage,
        status: form.status,
        date: form.date || null,
        notes: form.notes || null,
      }

      if (submission) {
        await api.patch(`/task-submissions/${submission.id}`, payload)
      } else {
        await api.post('/task-submissions', payload)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task-submissions'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['contributor'] })
      onClose()
    },
    onError: (err) => setError(extractErrorMessage(err)),
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    mutation.mutate()
  }

  return (
    <Modal title={submission ? 'Edit Submission' : 'Add Submission'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">CB Email</label>
          <input
            type="email"
            required
            disabled={!isManager}
            value={form.cb_email}
            onChange={(e) => setForm({ ...form, cb_email: e.target.value })}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent disabled:bg-gray-50 disabled:text-gray-500"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Task ID</label>
          <input
            value={form.task_id}
            onChange={(e) => setForm({ ...form, task_id: e.target.value })}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Project</label>
          <select
            value={form.project_id}
            onChange={(e) => setForm({ ...form, project_id: e.target.value, new_project: '' })}
            className="mb-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent"
          >
            <option value="">— None —</option>
            {projects?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {isManager && (
            <input
              placeholder="Or type a new project name..."
              value={form.new_project}
              onChange={(e) => setForm({ ...form, new_project: e.target.value, project_id: '' })}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent"
            />
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Stage</label>
            <select
              value={form.stage}
              onChange={(e) => setForm({ ...form, stage: e.target.value as Stage })}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent"
            >
              <option value="attempt">Attempt</option>
              <option value="l0">L0</option>
              <option value="l1">L1</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Status</label>
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as SubmissionStatus })}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent"
            >
              <option value="submitted">Submitted</option>
              <option value="in_progress">In Progress</option>
              <option value="empty">Empty</option>
              <option value="expired">Expired</option>
              <option value="claimed_by_another">Claimed by Another Person</option>
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Date</label>
          <input
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Notes</label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={2}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>

        {error && <div className="text-sm text-status-danger-text">{error}</div>}

        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
          >
            {mutation.isPending ? 'Saving...' : submission ? 'Save Changes' : 'Add Submission'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
