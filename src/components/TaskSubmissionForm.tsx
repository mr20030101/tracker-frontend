import { useId, useState, type FormEvent } from 'react'
import { Plus, Save, X } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, supabase } from '../lib/api'
import { useAuth } from '../lib/auth'
import { toISODate } from '../lib/week'
import type { Project, Stage, SubmissionStatus, TaskDensity, TaskSubmission } from '../types'
import { assignedProjectIds, fetchAssignments } from '../lib/cbProjects'
import { Modal } from './Modal'
import { Select } from './Select'
import { isNetworkError, queueSubmission } from '../lib/offlineQueue'
import { MANAGER_ROLES } from '../lib/roles'
import { useTeamFeatures } from '../lib/teamFeatures'


const STAGE_OPTIONS: { value: Stage; label: string }[] = [
  { value: 'attempt', label: 'Attempt' },
  { value: 'l0', label: 'L0' },
  { value: 'l1', label: 'L1' },
  { value: 'l10', label: 'L10' },
]

const DENSITY_OPTIONS: { value: TaskDensity | ''; label: string }[] = [
  { value: '', label: '—' },
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'complex', label: 'Complex' },
]

const STATUS_OPTIONS: { value: SubmissionStatus; label: string }[] = [
  { value: 'submitted', label: 'Submitted' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'empty', label: 'Empty' },
  { value: 'rejected', label: 'Rejected/SBQ' },
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
  // The RST team's extra fields, shown only for an RST contributor's task.
  density: '' as TaskDensity | '',
  task_link: '',
  progress_pct: '',
  frames: '',
}

// A whole number from a field, or null when it's blank.
function wholeNumber(value: string): number | null {
  const n = Number.parseInt(value, 10)
  return value.trim() === '' || Number.isNaN(n) ? null : n
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
          density: submission.density ?? '',
          task_link: submission.task_link ?? '',
          progress_pct: submission.progress_pct == null ? '' : String(submission.progress_pct),
          frames: submission.frames == null ? '' : String(submission.frames),
        }
      : { ...emptyForm, cb_email: isManager ? '' : (user?.email ?? '') },
  )
  const [error, setError] = useState<string | null>(null)
  const [projectMissing, setProjectMissing] = useState(false)
  const projectFieldId = useId()

  // Scope the Project choices to the target CB's assigned projects, from the ones their lead runs
  // (see lib/cbProjects.ts). A contributor logging their own already knows who they are.
  const { data: lookedUp } = useQuery({
    queryKey: ['profile-lead-id', form.cb_email],
    queryFn: async () => {
      const { data, error: profileError } = await supabase
        .from('profiles')
        .select('id, lead_id')
        .eq('email', form.cb_email)
        .maybeSingle()
      if (profileError) throw profileError
      return data ? { id: data.id as string, leadId: (data.lead_id as string | null) ?? null } : null
    },
    enabled: isManager && Boolean(form.cb_email),
  })
  const contributorLeadId = !isManager ? (user?.lead_id ?? null) : lookedUp?.leadId
  const contributorId = !isManager ? (user?.id ?? null) : (lookedUp?.id ?? null)
  // RST teams log a task's Density, Link, Progress % and # of Frames too (their task sheet's columns).
  const contributorTeam = useTeamFeatures(contributorId)
  const isRst = contributorTeam.loaded && contributorTeam.program === 'rst'
  const { data: contributorAssignments } = useQuery({
    queryKey: ['cb-project-assignments', contributorId],
    queryFn: () => fetchAssignments([contributorId!]),
    enabled: Boolean(contributorId),
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
    const ids = contributorId
      ? assignedProjectIds(
          contributorId,
          contributorLeadId,
          leadProjectIds.map((projectId) => ({ project_id: projectId, lead_id: contributorLeadId })),
          contributorAssignments ?? [],
        )
      : leadProjectIds
    const scoped = (projects ?? []).filter((p) => ids.includes(p.id))
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
        ...(isRst
          ? {
              density: form.density || null,
              task_link: form.task_link.trim() || null,
              progress_pct: wholeNumber(form.progress_pct),
              frames: wholeNumber(form.frames),
            }
          : {}),
      }

      if (submission) {
        await api.patch(`/task-submissions/${submission.id}`, payload)
        return
      }

      // A contributor's own task that's in progress starts its timer (any value starts it; the
      // database sets the real time, so a queued task's timer starts once it's sent).
      const newPayload = !isManager && form.status === 'in_progress' ? { ...payload, timer_started_at: new Date().toISOString() } : payload

      // A new task with the connection down is saved on this device and sent when it's back
      // (OfflineQueueBanner), rather than lost with the form. Only a plain new submission: one
      // that also creates a project already failed above without a connection.
      const queueIt = () => {
        if (!user) return false
        try {
          queueSubmission(user.id, newPayload)
          return true
        } catch {
          return false
        }
      }
      if (!navigator.onLine && queueIt()) return
      try {
        await api.post('/task-submissions', newPayload)
      } catch (err) {
        if (isNetworkError(err) && queueIt()) return
        throw err
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task-submissions'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['contributor'] })
      // Streaks, badges and the team's board move with every submission (and can set off a celebration).
      queryClient.invalidateQueries({ queryKey: ['achievements'] })
      queryClient.invalidateQueries({ queryKey: ['team-weeks'] })
      queryClient.invalidateQueries({ queryKey: ['reward-standings'] })
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
    // The Back Up Task Tracker form can't take a task without one.
    if (!form.project_id && !(isAdmin && form.new_project.trim())) {
      setProjectMissing(true)
      setError('Choose the task’s project.')
      document.getElementById(projectFieldId)?.focus()
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
          <label htmlFor={projectFieldId} className="mb-1 block text-sm font-medium text-gray-700">
            Project
          </label>
          <Select
            id={projectFieldId}
            fullWidth
            invalid={projectMissing}
            value={form.project_id}
            onChange={(value) => {
              setForm({ ...form, project_id: value, new_project: '' })
              setProjectMissing(false)
            }}
            placeholder="Choose a project…"
            options={visibleProjects.map((p) => ({ value: String(p.id), label: p.name }))}
            className={`mb-2 rounded-lg border px-3 py-2 text-sm outline-none focus:border-accent ${
              projectMissing ? 'border-status-danger-text' : 'border-gray-200'
            }`}
          />
          {projectMissing && <p className="mb-2 text-xs text-status-danger-text">Every task needs a project.</p>}
          {isAdmin && (
            <input
              placeholder="Or type a new project name..."
              value={form.new_project}
              onChange={(e) => {
                setForm({ ...form, new_project: e.target.value, project_id: '' })
                setProjectMissing(false)
              }}
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
            // Submitted means done: Progress goes to 100% (the database does the same).
            onChange={(value) => setForm({ ...form, status: value as SubmissionStatus, ...(value === 'submitted' ? { progress_pct: '100' } : {}) })}
            options={STATUS_OPTIONS}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>

        {isRst && (
          <>
            <div>
              <label htmlFor={`${projectFieldId}-density`} className="mb-1 block text-sm font-medium text-gray-700">
                Density
              </label>
              <Select
                id={`${projectFieldId}-density`}
                fullWidth
                value={form.density}
                onChange={(value) => setForm({ ...form, density: value as TaskDensity | '' })}
                options={DENSITY_OPTIONS}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </div>
            <div className="grid grid-cols-2 gap-x-4">
              <div>
                <label htmlFor={`${projectFieldId}-progress`} className="mb-1 block text-sm font-medium text-gray-700">
                  Progress %
                </label>
                <input
                  id={`${projectFieldId}-progress`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={100}
                  step={1}
                  value={form.progress_pct}
                  onChange={(e) => setForm({ ...form, progress_pct: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </div>
              <div>
                <label htmlFor={`${projectFieldId}-frames`} className="mb-1 block text-sm font-medium text-gray-700">
                  # of Frames
                </label>
                <input
                  id={`${projectFieldId}-frames`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={form.frames}
                  onChange={(e) => setForm({ ...form, frames: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </div>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor={`${projectFieldId}-link`} className="mb-1 block text-sm font-medium text-gray-700">
                Task link
              </label>
              <input
                id={`${projectFieldId}-link`}
                type="url"
                placeholder="https://..."
                maxLength={2000}
                value={form.task_link}
                onChange={(e) => setForm({ ...form, task_link: e.target.value })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </div>
          </>
        )}

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
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600"
          >
            <X className="h-4 w-4" aria-hidden />
            Cancel
          </button>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
          >
            {submission ? <Save className="h-4 w-4" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
            {mutation.isPending ? 'Saving...' : submission ? 'Save Changes' : 'Add Submission'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
