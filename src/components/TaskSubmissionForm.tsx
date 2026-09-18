import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, supabase } from '../lib/api'
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
  snipboard_url: '',
}

export function TaskSubmissionForm({ submission, onClose }: Props) {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const isManager = Boolean(user && MANAGER_ROLES.includes(user.role))
  const isAdmin = user?.role === 'admin'
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
          snipboard_url: submission.snipboard_url ?? '',
        }
      : { ...emptyForm, cb_email: isManager ? '' : (user?.email ?? '') },
  )
  const [error, setError] = useState<string | null>(null)

  // Scope the Project choices to whichever lead the target CB is attached
  // to, so a submission can only be logged against a project that lead
  // actually runs.
  const { data: contributorLeadId } = useQuery({
    queryKey: ['profile-lead-id', form.cb_email],
    queryFn: async () => {
      const { data, error: profileError } = await supabase
        .from('profiles')
        .select('lead_id')
        .eq('email', form.cb_email)
        .maybeSingle()
      if (profileError) throw profileError
      return (data?.lead_id as string | null) ?? null
    },
    enabled: Boolean(form.cb_email),
  })

  const { data: leadProjectIds } = useQuery({
    queryKey: ['project-leads-for-lead', contributorLeadId],
    queryFn: async () => {
      const { data, error: leadsError } = await supabase
        .from('project_leads')
        .select('project_id')
        .eq('lead_id', contributorLeadId!)
      if (leadsError) throw leadsError
      return data.map((row) => row.project_id as number)
    },
    enabled: Boolean(contributorLeadId),
  })

  const currentProjectId = form.project_id ? Number(form.project_id) : null
  const visibleProjects = (() => {
    if (!contributorLeadId || !leadProjectIds) return projects ?? []
    const scoped = (projects ?? []).filter((p) => leadProjectIds.includes(p.id))
    if (currentProjectId && !scoped.some((p) => p.id === currentProjectId)) {
      const existing = projects?.find((p) => p.id === currentProjectId)
      if (existing) return [...scoped, existing]
    }
    return scoped
  })()

  const mutation = useMutation({
    mutationFn: async () => {
      let projectId = form.project_id ? Number(form.project_id) : null

      if (isAdmin && !projectId && form.new_project.trim()) {
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
        snipboard_url: form.snipboard_url || null,
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
            {visibleProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {isAdmin && (
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
          <label className="mb-1 block text-sm font-medium text-gray-700">Snipboard.io</label>
          <input
            type="url"
            placeholder="https://snipboard.io/..."
            value={form.snipboard_url}
            onChange={(e) => setForm({ ...form, snipboard_url: e.target.value })}
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

        {error && (
          <div className="rounded-lg bg-status-danger-text px-3 py-2 text-sm text-status-danger-bg">{error}</div>
        )}

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
