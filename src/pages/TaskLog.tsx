import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Image } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, supabase } from '../lib/api'
import { useAuth } from '../lib/auth'
import { remotasksDiffViewerUrl } from '../lib/remotasks'
import { formatTime } from '../lib/week'
import type { Paginated, Project, Stage, SubmissionStatus, TaskSubmission } from '../types'
import { StatusPill } from '../components/StatusPill'
import { Avatar } from '../components/Avatar'
import { ActionsMenu } from '../components/ActionsMenu'
import { Select } from '../components/Select'
import { TaskSubmissionForm } from '../components/TaskSubmissionForm'
import { SortableHeader } from '../components/SortableHeader'
import { BulkImportModal } from '../components/BulkImportModal'
import { downloadCsv } from '../lib/csv'

const MANAGER_ROLES = ['admin', 'lead']

type SortKey = 'cb_email' | 'task_id' | 'project' | 'stage' | 'status' | 'date'

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
  { value: 'expired', label: 'Expired' },
  { value: 'claimed_by_another', label: 'Claimed by Another Person' },
]

export function TaskLog() {
  const { user } = useAuth()
  const isManager = Boolean(user && MANAGER_ROLES.includes(user.role))
  const [stage, setStage] = useState<Stage | ''>('')
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [formTarget, setFormTarget] = useState<'new' | TaskSubmission | null>(null)
  const [editingStatusId, setEditingStatusId] = useState<number | null>(null)
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'date', dir: 'desc' })
  const [bulkImportOpen, setBulkImportOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const queryClient = useQueryClient()

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => (await api.get<Project[]>('/projects')).data,
  })

  const { data, isLoading } = useQuery({
    queryKey: ['task-submissions', stage, search, dateFrom, dateTo, page, sort],
    queryFn: async () =>
      (
        await api.get<Paginated<TaskSubmission>>('/task-submissions', {
          params: {
            stage: stage || undefined,
            search: search || undefined,
            date_from: dateFrom || undefined,
            date_to: dateTo || undefined,
            page,
            sort: sort.key === 'project' ? 'project_id' : sort.key,
            sort_dir: sort.dir,
          },
        })
      ).data,
  })

  function toggleSort(key: SortKey) {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
    setPage(1)
  }

  async function handleExport() {
    setExporting(true)
    try {
      let query = supabase
        .from('task_submissions')
        .select('date, cb_email, task_id, project_id, stage, status, notes, submitted_at, snipboard_url')
        .order(sort.key === 'project' ? 'project_id' : sort.key, { ascending: sort.dir === 'asc' })
      if (stage) query = query.eq('stage', stage)
      if (search) {
        const term = search.replace(/[%,]/g, '')
        query = query.or(`cb_email.ilike.%${term}%,task_id.ilike.%${term}%`)
      }
      if (dateFrom) query = query.gte('date', dateFrom)
      if (dateTo) query = query.lte('date', dateTo)
      const { data: rows, error } = await query
      if (error) throw error

      const projectById = new Map((projects ?? []).map((p) => [p.id, p.name]))
      downloadCsv(
        `task-log-${new Date().toISOString().slice(0, 10)}.csv`,
        (rows ?? []).map((r) => ({
          date: r.date ?? '',
          cb_email: r.cb_email,
          task_id: r.task_id ?? '',
          project: r.project_id ? (projectById.get(r.project_id) ?? '') : '',
          stage: r.stage,
          status: r.status,
          notes: r.notes ?? '',
          submitted_at: r.submitted_at ?? '',
        })),
      )
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Export failed.')
    } finally {
      setExporting(false)
    }
  }

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
        <div className="flex gap-2">
          {isManager && (
            <button
              onClick={handleExport}
              disabled={exporting}
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {exporting ? 'Exporting...' : 'Export CSV'}
            </button>
          )}
          <button
            onClick={() => setBulkImportOpen(true)}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Bulk Import
          </button>
          <button
            onClick={() => setFormTarget('new')}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
          >
            + Add Submission
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        {isManager && (
          <input
            type="search"
            placeholder="Search by CB email or Task ID..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            className="w-64 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent"
          />
        )}
        <Select
          value={stage}
          onChange={(value) => {
            setStage(value as Stage | '')
            setPage(1)
          }}
          options={STAGES}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value)
              setPage(1)
            }}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <span className="text-sm text-gray-400">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value)
              setPage(1)
            }}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>
        {(stage || search || dateFrom || dateTo) && (
          <button
            onClick={() => {
              setStage('')
              setSearch('')
              setDateFrom('')
              setDateTo('')
              setPage(1)
            }}
            className="text-sm font-medium text-sky-700 hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
            <tr>
              <SortableHeader
                label="CB Email"
                active={sort.key === 'cb_email'}
                dir={sort.dir}
                onClick={() => toggleSort('cb_email')}
              />
              <SortableHeader
                label="Task ID"
                active={sort.key === 'task_id'}
                dir={sort.dir}
                onClick={() => toggleSort('task_id')}
              />
              <SortableHeader
                label="Project"
                active={sort.key === 'project'}
                dir={sort.dir}
                onClick={() => toggleSort('project')}
              />
              <SortableHeader
                label="Stage"
                active={sort.key === 'stage'}
                dir={sort.dir}
                onClick={() => toggleSort('stage')}
              />
              <SortableHeader
                label="Status"
                active={sort.key === 'status'}
                dir={sort.dir}
                onClick={() => toggleSort('status')}
              />
              <SortableHeader
                label="Date"
                active={sort.key === 'date'}
                dir={sort.dir}
                onClick={() => toggleSort('date')}
              />
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
                  <span className="inline-flex items-center gap-1.5">
                    {row.task_id ? (
                      <a
                        href={remotasksDiffViewerUrl(row.task_id)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sky-700 hover:underline"
                      >
                        {row.task_id}
                      </a>
                    ) : (
                      '—'
                    )}
                    {row.snipboard_url && (
                      <a
                        href={row.snipboard_url}
                        target="_blank"
                        rel="noreferrer"
                        title="View screenshot"
                        className="text-gray-400 hover:text-sky-700"
                      >
                        <Image className="h-3.5 w-3.5" strokeWidth={2} />
                      </a>
                    )}
                  </span>
                </td>
                <td className="px-5 py-3 text-gray-600">{row.project?.name ?? '—'}</td>
                <td className="px-5 py-3 uppercase text-gray-600">{row.stage}</td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    {editingStatusId === row.id ? (
                      <Select
                        aria-label="Change status"
                        autoOpen
                        value={row.status}
                        onChange={(value) => {
                          statusMutation.mutate({ id: row.id, status: value as SubmissionStatus })
                          setEditingStatusId(null)
                        }}
                        onClose={() => setEditingStatusId(null)}
                        options={STATUS_OPTIONS}
                        className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs outline-none focus:border-accent"
                      />
                    ) : (
                      <button onClick={() => setEditingStatusId(row.id)}>
                        <StatusPill status={row.status} />
                      </button>
                    )}
                  </div>
                </td>
                <td className="px-5 py-3 text-gray-500">
                  {row.date?.slice(0, 10) ?? '—'}
                  {row.date && <span className="ml-1.5 text-xs text-gray-400">{formatTime(row.created_at)}</span>}
                </td>
                <td className="px-5 py-3 text-right">
                  <div className="flex justify-end">
                    <ActionsMenu
                      items={[
                        { label: 'Edit', onClick: () => setFormTarget(row) },
                        {
                          label: 'Delete',
                          variant: 'danger',
                          onClick: () => {
                            if (confirm('Delete this submission?')) {
                              deleteMutation.mutate(row.id)
                            }
                          },
                        },
                      ]}
                    />
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

      {bulkImportOpen && (
        <BulkImportModal
          projects={projects ?? []}
          contributorEmail={isManager ? undefined : user?.email}
          contributorName={isManager ? undefined : user?.name}
          onClose={() => setBulkImportOpen(false)}
        />
      )}
    </div>
  )
}
