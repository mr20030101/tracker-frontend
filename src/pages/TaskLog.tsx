import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { Paginated, Stage, SubmissionStatus, TaskSubmission } from '../types'
import { StatusPill } from '../components/StatusPill'
import { Avatar } from '../components/Avatar'
import { TaskSubmissionForm } from '../components/TaskSubmissionForm'

const MANAGER_ROLES = ['admin', 'lead']

const CTS_FORM_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLSfXDNf6MntiYIlJHWBlEz2uKFe7I5aNzcPQHm007bUs2qBe9w/viewform'

function buildCtsFormUrl(row: TaskSubmission) {
  const params = new URLSearchParams()
  if (row.cb_email) params.set('entry.544080514', row.cb_email)
  if (row.task_id) params.set('entry.1598956863', row.task_id)
  if (row.project?.name) params.set('entry.525573583', row.project.name)
  if (row.notes) params.set('entry.1155908526', row.notes)
  return `${CTS_FORM_URL}?${params.toString()}`
}

const STAGES: { value: Stage | ''; label: string }[] = [
  { value: '', label: 'All Stages' },
  { value: 'attempt', label: 'Attempt' },
  { value: 'l0', label: 'L0' },
  { value: 'l1', label: 'L1' },
]

const STATUS_OPTIONS: { value: SubmissionStatus; label: string }[] = [
  { value: 'submitted', label: 'Submitted' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'empty', label: 'Empty' },
]

export function TaskLog() {
  const { user } = useAuth()
  const isManager = Boolean(user && MANAGER_ROLES.includes(user.role))
  const [stage, setStage] = useState<Stage | ''>('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [formTarget, setFormTarget] = useState<'new' | TaskSubmission | null>(null)
  const [editingStatusId, setEditingStatusId] = useState<number | null>(null)
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['task-submissions', stage, search, page],
    queryFn: async () =>
      (
        await api.get<Paginated<TaskSubmission>>('/task-submissions', {
          params: { stage: stage || undefined, cb_email: search || undefined, page },
        })
      ).data,
  })

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: SubmissionStatus }) =>
      api.patch(`/task-submissions/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task-submissions'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => api.delete(`/task-submissions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task-submissions'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] })
    },
  })

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Task Log</h1>
          <p className="text-sm text-gray-500">
            {data ? `${data.total} ${isManager ? 'total' : 'of your'} submissions` : 'Loading...'}
          </p>
        </div>
        <button
          onClick={() => setFormTarget('new')}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
        >
          + Add Submission
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        {isManager && (
          <input
            type="search"
            placeholder="Search by CB email..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            className="w-64 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent"
          />
        )}
        <select
          value={stage}
          onChange={(e) => {
            setStage(e.target.value as Stage | '')
            setPage(1)
          }}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent"
        >
          {STAGES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
            <tr>
              <th className="px-5 py-3">CB Email</th>
              <th className="px-5 py-3">Task ID</th>
              <th className="px-5 py-3">Project</th>
              <th className="px-5 py-3">Stage</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Date</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && (
              <tr>
                <td colSpan={7} className="px-5 py-6 text-center text-gray-400">
                  Loading...
                </td>
              </tr>
            )}
            {data?.data.map((row) => (
              <tr key={row.id} className="hover:bg-gray-50">
                <td className="px-5 py-3">
                  <Link
                    to={`/contributors/${encodeURIComponent(row.cb_email)}`}
                    className="flex items-center gap-3 hover:underline"
                  >
                    <Avatar name={row.cb_email} size={28} />
                    <span className="truncate">{row.cb_email}</span>
                  </Link>
                </td>
                <td className="max-w-40 truncate px-5 py-3 font-mono text-xs text-gray-500">
                  {row.task_id ?? '—'}
                </td>
                <td className="px-5 py-3 text-gray-600">{row.project?.name ?? '—'}</td>
                <td className="px-5 py-3 uppercase text-gray-600">{row.stage}</td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    {editingStatusId === row.id ? (
                      <select
                        aria-label="Change status"
                        autoFocus
                        value={row.status}
                        onChange={(e) => {
                          statusMutation.mutate({ id: row.id, status: e.target.value as SubmissionStatus })
                          setEditingStatusId(null)
                        }}
                        onBlur={() => setEditingStatusId(null)}
                        className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs outline-none focus:border-accent"
                      >
                        {STATUS_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <button onClick={() => setEditingStatusId(row.id)}>
                        <StatusPill status={row.status} />
                      </button>
                    )}
                  </div>
                </td>
                <td className="px-5 py-3 text-gray-500">{row.date?.slice(0, 10) ?? '—'}</td>
                <td className="px-5 py-3 text-right">
                  <div className="flex justify-end gap-3 text-xs font-medium">
                    <button
                      onClick={() => window.open(buildCtsFormUrl(row), '_blank', 'noopener,noreferrer')}
                      className="text-gray-500 hover:text-gray-900"
                    >
                      CTS
                    </button>
                    <button onClick={() => setFormTarget(row)} className="text-gray-500 hover:text-gray-900">
                      Edit
                    </button>
                    <button
                      onClick={() => {
                        if (confirm('Delete this submission?')) {
                          deleteMutation.mutate(row.id)
                        }
                      }}
                      className="text-status-danger-text hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {data && (
          <div className="flex items-center justify-between border-t border-gray-200 px-5 py-3 text-sm text-gray-500">
            <span>
              Showing {data.from ?? 0}–{data.to ?? 0} of {data.total}
            </span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="rounded-lg border border-gray-200 px-3 py-1 disabled:opacity-40"
              >
                Prev
              </button>
              <button
                disabled={page >= data.last_page}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border border-gray-200 px-3 py-1 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {formTarget && (
        <TaskSubmissionForm
          submission={formTarget === 'new' ? undefined : formTarget}
          onClose={() => setFormTarget(null)}
        />
      )}
    </div>
  )
}
