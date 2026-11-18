import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { FoldText } from '../components/FoldText'
import { Link } from 'react-router-dom'
import { ListChecks, Pencil, Trash2 } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { api, supabase } from '../lib/api'
import { remotasksDiffViewerUrl } from '../lib/remotasks'
import { TaskSubmissionForm } from '../components/TaskSubmissionForm'
import { DataTable } from '../components/DataTable'
import type { Project, Stage, SubmissionStatus, TaskSubmission } from '../types'
import { Modal } from '../components/Modal'
import { StatusPill } from '../components/StatusPill'
import { STAGE_LABELS } from '../lib/rewards'
import { formatTimer } from '../lib/taskTimer'
import { contributorPath } from '../lib/urlRef'
import { confirmDialog } from '../lib/dialog'
import { fetchAllPages } from '../lib/fetchAll'
import { usePageTitle } from '../lib/usePageTitle'

const HIGH_VOLUME_THRESHOLD = 20

interface Row {
  id: number
  task_id: string | null
  cb_email: string
  project_id: number | null
  date: string | null
  status: string
  stage: string
  created_at: string
  timer_elapsed_seconds: number
}

interface HighVolumeRow {
  cb_email: string
  date: string
  count: number
}

// Every submission, paged: there are more than the 1,000 rows one request returns (see fetchAll).
async function fetchAll(): Promise<Row[]> {
  return fetchAllPages<Row>((from, to) =>
    supabase
      .from('task_submissions')
      .select('id, task_id, cb_email, project_id, date, status, stage, created_at, timer_elapsed_seconds')
      .order('date', { ascending: false })
      .order('id')
      .range(from, to),
  )
}

function Section({
  title,
  count,
  description,
  actions,
  children,
}: {
  title: string
  count: number
  description: string
  actions?: ReactNode
  children: ReactNode
}) {
  const [open, setOpen] = useState(true)
  return (
    <div className="mb-4 overflow-hidden card">
      <div className="flex w-full items-center justify-between px-5 py-4">
        <button onClick={() => setOpen((v) => !v)} className="flex flex-1 items-center gap-2 text-left">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
              {count > 0 && (
                <span className="rounded-full bg-status-danger-bg px-2 py-0.5 text-xs font-semibold text-status-danger-text">
                  {count}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-gray-500">{description}</p>
          </div>
        </button>
        <div className="flex shrink-0 items-center gap-3">
          {actions}
          <button onClick={() => setOpen((v) => !v)} className="text-gray-400" aria-label={open ? 'Collapse' : 'Expand'}>
            {open ? '▲' : '▼'}
          </button>
        </div>
      </div>
      {open && count > 0 && <div className="border-t border-gray-200">{children}</div>}
    </div>
  )
}

export function DataQuality() {
  usePageTitle('Data Quality')
  const queryClient = useQueryClient()
  const [editTarget, setEditTarget] = useState<TaskSubmission | null>(null)
  const [volumeTarget, setVolumeTarget] = useState<HighVolumeRow | null>(null)

  const { data: rows, isLoading } = useQuery({
    queryKey: ['data-quality-rows'],
    queryFn: fetchAll,
  })

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => (await api.get<Project[]>('/projects')).data,
    staleTime: 5 * 60_000,
  })
  const projectNames = useMemo(() => new Map((projects ?? []).map((p) => [p.id, p.name])), [projects])

  // Looked up from the loaded rows each render, so an edit or delete shows straight away.
  const volumeTasks = useMemo(
    () =>
      volumeTarget
        ? (rows ?? [])
            .filter((r) => r.cb_email === volumeTarget.cb_email && r.date === volumeTarget.date)
            .sort((a, b) => a.created_at.localeCompare(b.created_at))
        : [],
    [rows, volumeTarget],
  )

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from('task_submissions').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['data-quality-rows'] })
      queryClient.invalidateQueries({ queryKey: ['task-submissions'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] })
      queryClient.invalidateQueries({ queryKey: ['contributor'] })
    },
  })

  const all = useMemo(() => rows ?? [], [rows])

  const duplicates = useMemo(() => {
    const groups = new Map<string, Row[]>()
    for (const row of all) {
      if (!row.task_id) continue
      const list = groups.get(row.task_id) ?? []
      list.push(row)
      groups.set(row.task_id, list)
    }
    return [...groups.entries()].filter(([, list]) => list.length > 1)
  }, [all])
  const duplicateRowCount = duplicates.reduce((sum, [, list]) => sum + list.length, 0)
  const duplicateRows = useMemo(
    () => duplicates.flatMap(([, group]) => group.map((row, i) => ({ ...row, firstInGroup: i === 0 }))),
    [duplicates],
  )

  const missingProject = useMemo(() => all.filter((r) => r.task_id && r.project_id == null), [all])
  const missingTaskId = useMemo(() => all.filter((r) => !r.task_id && r.cb_email), [all])

  const highVolume = useMemo(() => {
    const groups = new Map<string, HighVolumeRow>()
    for (const row of all) {
      if (!row.date) continue
      const key = `${row.cb_email}|${row.date}`
      const existing = groups.get(key)
      if (existing) existing.count += 1
      else groups.set(key, { cb_email: row.cb_email, date: row.date, count: 1 })
    }
    return [...groups.values()].filter((g) => g.count > HIGH_VOLUME_THRESHOLD).sort((a, b) => b.count - a.count)
  }, [all])

  const deleteAllMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const { error } = await supabase.from('task_submissions').delete().in('id', ids)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['data-quality-rows'] })
      queryClient.invalidateQueries({ queryKey: ['task-submissions'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] })
      queryClient.invalidateQueries({ queryKey: ['contributor'] })
    },
  })

  const handleDelete = useCallback(
    async (id: number) => {
      if (await confirmDialog('Delete this submission?', { confirmLabel: 'Delete', danger: true })) deleteMutation.mutate(id)
    },
    [deleteMutation],
  )

  async function handleDeleteAll(ids: number[]) {
    if (await confirmDialog(`Delete all ${ids.length} submissions with no Task ID? This cannot be undone.`, { confirmLabel: 'Delete', danger: true })) {
      deleteAllMutation.mutate(ids)
    }
  }

  const duplicateColumns = useMemo<ColumnDef<Row & { firstInGroup: boolean }, any>[]>(
    () => [
      {
        id: 'task_id',
        accessorFn: (r) => r.task_id ?? '',
        header: 'Task ID',
        cell: ({ row }) => <span className="block whitespace-nowrap font-mono text-xs text-gray-500">{row.original.task_id}</span>,
      },
      {
        id: 'cb_email',
        accessorFn: (r) => r.cb_email,
        header: 'CB Email',
        cell: ({ row }) => (
          <Link to={contributorPath(row.original.cb_email)} className="text-sky-700 hover:underline">
            {row.original.cb_email}
          </Link>
        ),
      },
      {
        id: 'date',
        accessorFn: (r) => r.date ?? '',
        header: 'Date',
        cell: ({ row }) => <span className="text-gray-500">{row.original.date ?? '—'}</span>,
      },
      {
        id: 'status',
        accessorFn: (r) => r.status,
        header: 'Status',
        cell: ({ row }) => <span className="text-gray-600">{row.original.status}</span>,
      },
      {
        id: 'actions',
        header: 'Actions',
        enableSorting: false,
        meta: { align: 'right' },
        cell: ({ row }) => (
          <div className="flex justify-end">
            <button
              onClick={() => handleDelete(row.original.id)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-status-danger-text hover:underline"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              Delete
            </button>
          </div>
        ),
      },
    ],
    [handleDelete],
  )

  const missingProjectColumns = useMemo<ColumnDef<Row, any>[]>(
    () => [
      {
        id: 'task_id',
        accessorFn: (r) => r.task_id ?? '',
        header: 'Task ID',
        enableSorting: false,
        cell: ({ row }) =>
          row.original.task_id ? (
            <a
              href={remotasksDiffViewerUrl(row.original.task_id)}
              target="_blank"
              rel="noreferrer"
              className="block whitespace-nowrap font-mono text-xs text-sky-700 hover:underline"
            >
              {row.original.task_id}
            </a>
          ) : (
            <span className="text-gray-500">—</span>
          ),
      },
      {
        id: 'cb_email',
        accessorFn: (r) => r.cb_email,
        header: 'CB Email',
        cell: ({ row }) => (
          <Link to={contributorPath(row.original.cb_email)} className="text-sky-700 hover:underline">
            {row.original.cb_email}
          </Link>
        ),
      },
      {
        id: 'date',
        accessorFn: (r) => r.date ?? '',
        header: 'Date',
        cell: ({ row }) => <span className="text-gray-500">{row.original.date ?? '—'}</span>,
      },
      {
        id: 'actions',
        header: 'Actions',
        enableSorting: false,
        meta: { align: 'right' },
        cell: ({ row }) => (
          <div className="flex justify-end">
            <button
              onClick={() => setEditTarget(row.original as unknown as TaskSubmission)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-900"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden />
              Edit
            </button>
          </div>
        ),
      },
    ],
    [],
  )

  const missingTaskIdColumns = useMemo<ColumnDef<Row, any>[]>(
    () => [
      {
        id: 'cb_email',
        accessorFn: (r) => r.cb_email,
        header: 'CB Email',
        cell: ({ row }) => (
          <Link to={contributorPath(row.original.cb_email)} className="text-sky-700 hover:underline">
            {row.original.cb_email}
          </Link>
        ),
      },
      {
        id: 'date',
        accessorFn: (r) => r.date ?? '',
        header: 'Date',
        cell: ({ row }) => <span className="text-gray-500">{row.original.date ?? '—'}</span>,
      },
      {
        id: 'status',
        accessorFn: (r) => r.status,
        header: 'Status',
        cell: ({ row }) => <span className="text-gray-600">{row.original.status}</span>,
      },
      {
        id: 'actions',
        header: 'Actions',
        enableSorting: false,
        meta: { align: 'right' },
        cell: ({ row }) => (
          <div className="flex justify-end">
            <button
              onClick={() => handleDelete(row.original.id)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-status-danger-text hover:underline"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              Delete
            </button>
          </div>
        ),
      },
    ],
    [handleDelete],
  )

  const highVolumeColumns = useMemo<ColumnDef<HighVolumeRow, any>[]>(
    () => [
      {
        id: 'cb_email',
        accessorFn: (r) => r.cb_email,
        header: 'CB Email',
        cell: ({ row }) => (
          <Link to={contributorPath(row.original.cb_email)} className="text-sky-700 hover:underline">
            {row.original.cb_email}
          </Link>
        ),
      },
      { id: 'date', accessorFn: (r) => r.date, header: 'Date', cell: ({ row }) => <span className="text-gray-500">{row.original.date}</span> },
      {
        id: 'count',
        accessorFn: (r) => r.count,
        header: 'Count',
        cell: ({ row }) => <span className="font-semibold text-gray-900">{row.original.count}</span>,
      },
      {
        id: 'actions',
        header: 'Actions',
        enableSorting: false,
        meta: { align: 'right' },
        cell: ({ row }) => (
          <div className="flex justify-end">
            <button
              onClick={() => setVolumeTarget(row.original)}
              className="inline-flex min-h-8 items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-900 pointer-coarse:min-h-11"
            >
              <ListChecks className="h-3.5 w-3.5" aria-hidden />
              View tasks
            </button>
          </div>
        ),
      },
    ],
    [],
  )

  const volumeTaskColumns = useMemo<ColumnDef<Row, any>[]>(
    () => [
      {
        id: 'task_id',
        accessorFn: (r) => r.task_id ?? '',
        header: 'Task ID',
        cell: ({ row }) =>
          row.original.task_id ? (
            <a
              href={remotasksDiffViewerUrl(row.original.task_id)}
              target="_blank"
              rel="noreferrer"
              className="block whitespace-nowrap font-mono text-xs text-sky-700 hover:underline"
            >
              {row.original.task_id}
            </a>
          ) : (
            <span className="text-gray-500">—</span>
          ),
      },
      {
        id: 'project',
        accessorFn: (r) => (r.project_id ? (projectNames.get(r.project_id) ?? '') : ''),
        header: 'Project',
        cell: ({ getValue }) => <span className="text-gray-600">{getValue() || '—'}</span>,
      },
      {
        id: 'stage',
        accessorFn: (r) => r.stage,
        header: 'Stage',
        cell: ({ row }) => <span className="text-gray-600">{STAGE_LABELS[row.original.stage as Stage] ?? row.original.stage}</span>,
      },
      {
        id: 'status',
        accessorFn: (r) => r.status,
        header: 'Status',
        cell: ({ row }) => <StatusPill status={row.original.status as SubmissionStatus} />,
      },
      {
        id: 'logged',
        accessorFn: (r) => r.created_at,
        header: 'Logged',
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-gray-500">
            {new Date(row.original.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </span>
        ),
      },
      {
        id: 'time',
        accessorFn: (r) => r.timer_elapsed_seconds,
        header: 'Time',
        meta: { align: 'right' },
        cell: ({ row }) => <span className="tabular-nums text-gray-600">{formatTimer(row.original.timer_elapsed_seconds ?? 0)}</span>,
      },
      {
        id: 'actions',
        header: 'Actions',
        enableSorting: false,
        meta: { align: 'right' },
        cell: ({ row }) => (
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setEditTarget(row.original as unknown as TaskSubmission)}
              className="inline-flex min-h-8 items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-900 pointer-coarse:min-h-11"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden />
              Edit
            </button>
            <button
              onClick={() => handleDelete(row.original.id)}
              className="inline-flex min-h-8 items-center gap-1.5 text-xs font-medium text-status-danger-text hover:underline pointer-coarse:min-h-11"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              Delete
            </button>
          </div>
        ),
      },
    ],
    [projectNames, handleDelete],
  )

  return (
    <div>
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-3xl font-medium sm:text-4xl text-gray-900">
          <FoldText text="Data Quality" />
        </h1>
        <p className="text-sm text-gray-500">Automated checks across all task log submissions.</p>
      </div>

      {isLoading && <div className="text-gray-400">Loading...</div>}

      {!isLoading && (
        <>
          <Section
            title="Duplicate Task IDs"
            count={duplicateRowCount}
            description="The same Task ID appears in more than one submission."
          >
            <DataTable
              bare
              columns={duplicateColumns}
              data={duplicateRows}
              getRowId={(r) => String(r.id)}
              rowClassName={(r) => (r.firstInGroup ? 'bg-status-warning-bg/40' : '')}
            />
          </Section>

          <Section
            title="Missing Project"
            count={missingProject.length}
            description="Submissions with a Task ID but no project assigned."
          >
            <DataTable bare columns={missingProjectColumns} data={missingProject} getRowId={(r) => String(r.id)} />
          </Section>

          <Section
            title="Missing Task ID"
            count={missingTaskId.length}
            description="Submissions with no Task ID recorded (may be intentional blank placeholders)."
            actions={
              missingTaskId.length > 0 && (
                <button
                  onClick={() => handleDeleteAll(missingTaskId.map((row) => row.id))}
                  disabled={deleteAllMutation.isPending}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-status-danger-text hover:underline disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  {deleteAllMutation.isPending ? 'Deleting...' : 'Delete All'}
                </button>
              )
            }
          >
            <DataTable bare columns={missingTaskIdColumns} data={missingTaskId} getRowId={(r) => String(r.id)} />
          </Section>

          <Section
            title="Unusually High Daily Volume"
            count={highVolume.length}
            description={`More than ${HIGH_VOLUME_THRESHOLD} submissions from one contributor on a single day — possible bulk-entry error.`}
          >
            <DataTable bare columns={highVolumeColumns} data={highVolume} getRowId={(g) => `${g.cb_email}|${g.date}`} />
          </Section>

          {duplicateRowCount === 0 &&
            missingProject.length === 0 &&
            missingTaskId.length === 0 &&
            highVolume.length === 0 && (
              <div className="rounded-xl border border-status-success-text/30 bg-status-success-bg px-5 py-4 text-sm text-status-success-text">
                No data quality issues found.
              </div>
            )}
        </>
      )}

      {volumeTarget && (
        <Modal title={`${volumeTasks.length} tasks on ${volumeTarget.date}`} onClose={() => setVolumeTarget(null)} maxWidthClassName="max-w-4xl">
          <p className="mb-4 text-sm text-gray-500">
            <Link to={contributorPath(volumeTarget.cb_email)} className="text-sky-700 hover:underline">
              {volumeTarget.cb_email}
            </Link>
            {' · in the order they were logged'}
          </p>
          <DataTable bare columns={volumeTaskColumns} data={volumeTasks} getRowId={(r) => String(r.id)} />
        </Modal>
      )}

      {editTarget && <TaskSubmissionForm submission={editTarget} onClose={() => setEditTarget(null)} />}
    </div>
  )
}
