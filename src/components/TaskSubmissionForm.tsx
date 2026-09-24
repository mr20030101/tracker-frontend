import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, supabase } from '../lib/api'
import { useAuth } from '../lib/auth'
import { toISODate } from '../lib/week'
import type { Project, Stage, SubmissionStatus, TaskSubmission } from '../types'
import { Modal } from './Modal'
import { Select } from './Select'

const MANAGER_ROLES = ['admin', 'lead']

const STAGE_OPTIONS: { value: Stage; label: string }[] = [
  { value: 'attempt', label: 'Attempt' },
  { value: 'l0', label: 'L0' },
  { value: 'l1', label: 'L1' },
]

const STATUS_OPTIONS: { value: SubmissionStatus; label: string }[] = [
  { value: 'submitted', label: 'Submitted' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'empty', label: 'Empty' },
  { value: 'expired', label: 'Expired' },
  { value: 'claimed_by_another', label: 'Claimed by Another Person' },
]

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
  date: toISODate(new Date()),
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
          date: submission.date?.slice(0, 10) ?? toISODate(new Date()),
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
        cb_email: form.cb_email.trim(),
        task_id: form.task_id.trim(),
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
    if (!form.cb_email.trim() || !form.task_id.trim()) {
      setError('CB Email and Task ID are required.')
      return
    }
    setError(null)
    mutation.mutate()
  }

  return (
    <Modal title={submission ? 'Edit Submission' : 'Add Submission'} onClose={onClose} maxWidthClassName="max-w-2xl">
      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
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
            required
            value={form.task_id}
            onChange={(e) => setForm({ ...form, task_id: e.target.value })}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Project</label>
          <Select
            fullWidth
            value={form.project_id}
            onChange={(value) => setForm({ ...form, project_id: value, new_project: '' })}
            options={[{ value: '', label: '— None —' }, ...visibleProjects.map((p) => ({ value: String(p.id), label: p.name }))]}
            className="mb-2 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          {isAdmin && (
            <input
              placeholder="Or type a new project name..."
              value={form.new_project}
              onChange={(e) => setForm({ ...form, new_project: e.target.value, project_id: '' })}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent"
            />
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Date</label>
          <input
            type="date"
            value={form.date}
            max={toISODate(new Date())}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Stage</label>
          <Select
            fullWidth
            value={form.stage}
            onChange={(value) => setForm({ ...form, stage: value as Stage })}
            options={STAGE_OPTIONS}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Status</label>
          <Select
            fullWidth
            value={form.status}
            onChange={(value) => setForm({ ...form, status: value as SubmissionStatus })}
            options={STATUS_OPTIONS}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium text-gray-700">Screenshot link</label>
          <input
            type="url"
            placeholder="https://... (Snipboard, Lightshot, etc.)"
            value={form.snipboard_url}
            onChange={(e) => setForm({ ...form, snipboard_url: e.target.value })}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium text-gray-700">Notes</label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={2}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>

        {error && (
          <div className="rounded-lg bg-status-danger-text px-3 py-2 text-sm text-status-danger-bg sm:col-span-2">{error}</div>
        )}

        <div className="mt-2 flex justify-end gap-2 sm:col-span-2">
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
