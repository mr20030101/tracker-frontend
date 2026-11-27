import { useCallback, useMemo, useState } from 'react'
import { FoldText } from '../components/FoldText'
import { Link, useSearchParams } from 'react-router-dom'
import { ListChecks, Pencil, RefreshCw, Trash2 } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { api, supabase } from '../lib/api'
import { remotasksDiffViewerUrl } from '../lib/remotasks'
import { TaskSubmissionForm } from '../components/TaskSubmissionForm'
import { DataTable } from '../components/DataTable'
import type { Project, Stage, SubmissionStatus, TaskSubmission } from '../types'
import { Modal } from '../components/Modal'
import { StatusPill } from '../components/StatusPill'
import { SegmentedTabs } from '../components/TableToolbar'
import { STAGE_LABELS } from '../lib/rewards'
import { formatTimer } from '../lib/taskTimer'
import { contributorPath } from '../lib/urlRef'
import { confirmDialog } from '../lib/dialog'
import { fetchAllPages } from '../lib/fetchAll'
import { usePageTitle } from '../lib/usePageTitle'
import { LONG_CACHE } from '../lib/queryCache'

const HIGH_VOLUME_THRESHOLD = 20

// One tab per check. Each tab asks for its data only once it's opened, and what's loaded is kept
// (CACHE) so going back to a tab, or to the page, doesn't load it again.
type Tab = 'duplicates' | 'missing_project' | 'missing_task_id' | 'high_volume'
const TABS: { value: Tab; label: string }[] = [
  { value: 'duplicates', label: 'Duplicate Task IDs' },
  { value: 'missing_project', label: 'Missing Project' },
  { value: 'missing_task_id', label: 'Missing Task ID' },
  { value: 'high_volume', label: 'High Daily Volume' },
]
const isTab = (value: string | null): value is Tab => TABS.some((t) => t.value === value)

// Reused for 10 minutes and kept for 30 (LONG_CACHE). Unlike LONG_CACHE it refetches on opening a
// tab once the data is stale, so an edit or delete (which marks it stale) shows the next time.
const CACHE = { ...LONG_CACHE, refetchOnMount: true } as const
const KEY = 'data-quality'

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

// The Duplicate Task IDs and High Daily Volume checks group every task, so they share one download
// of every task, with only the columns they need.
type ScanRow = Pick<Row, 'id' | 'task_id' | 'cb_email' | 'date' | 'status'>

interface HighVolumeRow {
  cb_email: string
  date: string
  count: number
}

const ROW_COLUMNS = 'id, task_id, cb_email, project_id, date, status, stage, created_at, timer_elapsed_seconds'

function fetchScan(): Promise<ScanRow[]> {
  return fetchAllPages<ScanRow>((from, to) =>
    supabase.from('task_submissions').select('id, task_id, cb_email, date, status').order('date', { ascending: false }).order('id').range(from, to),
  )
}

// The other two checks are filtered by the database, so only the tasks they list are sent.
function fetchMissingProject(): Promise<Row[]> {
  return fetchAllPages<Row>((from, to) =>
    supabase
      .from('task_submissions')
      .select(ROW_COLUMNS)
      .not('task_id', 'is', null)
      .neq('task_id', '')
      .is('project_id', null)
      .order('date', { ascending: false })
      .order('id')
      .range(from, to),
  )
}

function fetchMissingTaskId(): Promise<Row[]> {
  return fetchAllPages<Row>((from, to) =>
    supabase
      .from('task_submissions')
      .select(ROW_COLUMNS)
      .or('task_id.is.null,task_id.eq.')
      .order('date', { ascending: false })
      .order('id')
      .range(from, to),
  )
}

// One contributor's tasks on one day (View tasks), by the indexed cb_email_lower.
async function fetchDay(email: string, date: string): Promise<Row[]> {
  const { data, error } = await supabase
    .from('task_submissions')
    .select(ROW_COLUMNS)
    .eq('cb_email_lower', email.toLowerCase())
    .eq('date', date)
    .order('created_at')
  if (error) throw error
  return (data ?? []) as Row[]
}

function emailCell(email: string) {
  return (
    <Link to={contributorPath(email)} className="text-sky-700 hover:underline">
      {email}
    </Link>
  )
}

function taskLinkCell(taskId: string | null) {
  return taskId ? (
    <a href={remotasksDiffViewerUrl(taskId)} target="_blank" rel="noreferrer" className="block whitespace-nowrap font-mono text-xs text-sky-700 hover:underline">
      {taskId}
    </a>
  ) : (
    <span className="text-gray-500">—</span>
  )
}

function updatedAgo(at: number): string {
  const minutes = Math.floor((Date.now() - at) / 60_000)
  if (minutes < 1) return 'Updated just now'
  return minutes === 1 ? 'Updated 1 minute ago' : `Updated ${minutes} minutes ago`
}

export function DataQuality() {
  usePageTitle('Data Quality')
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const tab: Tab = isTab(tabParam) ? tabParam : 'duplicates'
  const setTab = (next: Tab) => setSearchParams(next === 'duplicates' ? {} : { tab: next }, { replace: true })
  const [editTarget, setEditTarget] = useState<TaskSubmission | null>(null)
  const [volumeTarget, setVolumeTarget] = useState<HighVolumeRow | null>(null)

  // Only the open tab's query runs; the others still return what's cached (for their counts).
  const usesScan = tab === 'duplicates' || tab === 'high_volume'
  const scan = useQuery({ queryKey: [KEY, 'scan'], queryFn: fetchScan, enabled: usesScan, ...CACHE })
  const missingProjectQuery = useQuery({ queryKey: [KEY, 'missing-project'], queryFn: fetchMissingProject, enabled: tab === 'missing_project', ...CACHE })
  const missingTaskIdQuery = useQuery({ queryKey: [KEY, 'missing-task-id'], queryFn: fetchMissingTaskId, enabled: tab === 'missing_task_id', ...CACHE })
  const dayQuery = useQuery({
    queryKey: [KEY, 'day', volumeTarget?.cb_email, volumeTarget?.date],
    queryFn: () => fetchDay(volumeTarget!.cb_email, volumeTarget!.date),
    enabled: Boolean(volumeTarget),
    ...CACHE,
  })
  const active = usesScan ? scan : tab === 'missing_project' ? missingProjectQuery : missingTaskIdQuery

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => (await api.get<Project[]>('/projects')).data,
    staleTime: 5 * 60_000,
  })
  const projectNames = useMemo(() => new Map((projects ?? []).map((p) => [p.id, p.name])), [projects])

  // After an edit or delete: every check may have changed. The open tab reloads now, the others
  // the next time they're opened.
  const refreshAfterChange = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [KEY] })
    queryClient.invalidateQueries({ queryKey: ['task-submissions'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] })
    queryClient.invalidateQueries({ queryKey: ['contributor'] })
  }, [queryClient])

  const deleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const { error } = await supabase.from('task_submissions').delete().in('id', ids)
      if (error) throw error
    },
    onSuccess: refreshAfterChange,
  })
  const deleteOne = deleteMutation.mutate

  const scanRows = scan.data
  const duplicateRows = useMemo(() => {
    if (!scanRows) return null
    const groups = new Map<string, ScanRow[]>()
    for (const row of scanRows) {
      if (!row.task_id) continue
      const list = groups.get(row.task_id) ?? []
      list.push(row)
      groups.set(row.task_id, list)
    }
    return [...groups.values()].filter((list) => list.length > 1).flatMap((group) => group.map((row, i) => ({ ...row, firstInGroup: i === 0 })))
  }, [scanRows])

  const highVolume = useMemo(() => {
    if (!scanRows) return null
    const groups = new Map<string, HighVolumeRow>()
    for (const row of scanRows) {
      if (!row.date) continue
      const key = `${row.cb_email}|${row.date}`
      const existing = groups.get(key)
      if (existing) existing.count += 1
      else groups.set(key, { cb_email: row.cb_email, date: row.date, count: 1 })
    }
    return [...groups.values()].filter((g) => g.count > HIGH_VOLUME_THRESHOLD).sort((a, b) => b.count - a.count)
  }, [scanRows])

  const missingProject = missingProjectQuery.data ?? null
  const missingTaskId = missingTaskIdQuery.data ?? null

  const handleDelete = useCallback(
    async (id: number) => {
      if (await confirmDialog('Delete this submission?', { confirmLabel: 'Delete', danger: true })) deleteOne([id])
    },
    [deleteOne],
  )

  async function handleDeleteAll(ids: number[]) {
    if (await confirmDialog(`Delete all ${ids.length} submissions with no Task ID? This cannot be undone.`, { confirmLabel: 'Delete', danger: true })) {
      deleteMutation.mutate(ids)
    }
  }

  const deleteButton = useCallback(
    (id: number) => (
      <button
        onClick={() => handleDelete(id)}
        className="inline-flex min-h-8 items-center gap-1.5 text-xs font-medium text-status-danger-text hover:underline pointer-coarse:min-h-11"
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden />
        Delete
      </button>
    ),
    [handleDelete],
  )
  const editButton = useCallback(
    (row: Row) => (
      <button
        onClick={() => setEditTarget(row as unknown as TaskSubmission)}
        className="inline-flex min-h-8 items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-900 pointer-coarse:min-h-11"
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden />
        Edit
      </button>
    ),
    [],
  )

  const duplicateColumns = useMemo<ColumnDef<ScanRow & { firstInGroup: boolean }, any>[]>(
    () => [
      {
        id: 'task_id',
        accessorFn: (r) => r.task_id ?? '',
        header: 'Task ID',
        cell: ({ row }) => <span className="block whitespace-nowrap font-mono text-xs text-gray-500">{row.original.task_id}</span>,
      },
      { id: 'cb_email', accessorFn: (r) => r.cb_email, header: 'CB Email', cell: ({ row }) => emailCell(row.original.cb_email) },
      { id: 'date', accessorFn: (r) => r.date ?? '', header: 'Date', cell: ({ row }) => <span className="text-gray-500">{row.original.date ?? '—'}</span> },
      { id: 'status', accessorFn: (r) => r.status, header: 'Status', cell: ({ row }) => <span className="text-gray-600">{row.original.status}</span> },
      {
        id: 'actions',
        header: 'Actions',
        enableSorting: false,
        meta: { align: 'right' },
        cell: ({ row }) => <div className="flex justify-end">{deleteButton(row.original.id)}</div>,
      },
    ],
    [deleteButton],
  )

  const missingProjectColumns = useMemo<ColumnDef<Row, any>[]>(
    () => [
      { id: 'task_id', accessorFn: (r) => r.task_id ?? '', header: 'Task ID', enableSorting: false, cell: ({ row }) => taskLinkCell(row.original.task_id) },
      { id: 'cb_email', accessorFn: (r) => r.cb_email, header: 'CB Email', cell: ({ row }) => emailCell(row.original.cb_email) },
      { id: 'date', accessorFn: (r) => r.date ?? '', header: 'Date', cell: ({ row }) => <span className="text-gray-500">{row.original.date ?? '—'}</span> },
      {
        id: 'actions',
        header: 'Actions',
        enableSorting: false,
        meta: { align: 'right' },
        cell: ({ row }) => <div className="flex justify-end">{editButton(row.original)}</div>,
      },
    ],
    [editButton],
  )

  const missingTaskIdColumns = useMemo<ColumnDef<Row, any>[]>(
    () => [
      { id: 'cb_email', accessorFn: (r) => r.cb_email, header: 'CB Email', cell: ({ row }) => emailCell(row.original.cb_email) },
      { id: 'date', accessorFn: (r) => r.date ?? '', header: 'Date', cell: ({ row }) => <span className="text-gray-500">{row.original.date ?? '—'}</span> },
      { id: 'status', accessorFn: (r) => r.status, header: 'Status', cell: ({ row }) => <span className="text-gray-600">{row.original.status}</span> },
      {
        id: 'actions',
        header: 'Actions',
        enableSorting: false,
        meta: { align: 'right' },
        cell: ({ row }) => <div className="flex justify-end">{deleteButton(row.original.id)}</div>,
      },
    ],
    [deleteButton],
  )

  const highVolumeColumns = useMemo<ColumnDef<HighVolumeRow, any>[]>(
    () => [
      { id: 'cb_email', accessorFn: (r) => r.cb_email, header: 'CB Email', cell: ({ row }) => emailCell(row.original.cb_email) },
      { id: 'date', accessorFn: (r) => r.date, header: 'Date', cell: ({ row }) => <span className="text-gray-500">{row.original.date}</span> },
      { id: 'count', accessorFn: (r) => r.count, header: 'Count', cell: ({ row }) => <span className="font-semibold text-gray-900">{row.original.count}</span> },
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
      { id: 'task_id', accessorFn: (r) => r.task_id ?? '', header: 'Task ID', cell: ({ row }) => taskLinkCell(row.original.task_id) },
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
      { id: 'status', accessorFn: (r) => r.status, header: 'Status', cell: ({ row }) => <StatusPill status={row.original.status as SubmissionStatus} /> },
      {
        id: 'logged',
        accessorFn: (r) => r.created_at,
        header: 'Logged',
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-gray-500">{new Date(row.original.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
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
            {editButton(row.original)}
            {deleteButton(row.original.id)}
          </div>
        ),
      },
    ],
    [projectNames, deleteButton, editButton],
  )

  // A tab's count once its data has been loaded (now or earlier in the visit).
  const counts: Record<Tab, number | undefined> = {
    duplicates: duplicateRows?.length,
    missing_project: missingProject?.length,
    missing_task_id: missingTaskId?.length,
    high_volume: highVolume?.length,
  }

  const descriptions: Record<Tab, string> = {
    duplicates: 'The same Task ID appears in more than one submission.',
    missing_project: 'Submissions with a Task ID but no project assigned.',
    missing_task_id: 'Submissions with no Task ID recorded (may be intentional blank placeholders).',
    high_volume: `More than ${HIGH_VOLUME_THRESHOLD} submissions from one contributor on a single day — possible bulk-entry error.`,
  }

  function renderTable() {
    if (tab === 'duplicates' && duplicateRows)
      return duplicateRows.length > 0 && (
        <DataTable
          bare
          columns={duplicateColumns}
          data={duplicateRows}
          getRowId={(r) => String(r.id)}
          rowClassName={(r) => (r.firstInGroup ? 'bg-status-warning-bg/40' : '')}
        />
      )
    if (tab === 'missing_project' && missingProject)
      return missingProject.length > 0 && <DataTable bare columns={missingProjectColumns} data={missingProject} getRowId={(r) => String(r.id)} />
    if (tab === 'missing_task_id' && missingTaskId)
      return missingTaskId.length > 0 && <DataTable bare columns={missingTaskIdColumns} data={missingTaskId} getRowId={(r) => String(r.id)} />
    if (tab === 'high_volume' && highVolume)
      return highVolume.length > 0 && <DataTable bare columns={highVolumeColumns} data={highVolume} getRowId={(g) => `${g.cb_email}|${g.date}`} />
    return null
  }

  const count = counts[tab]

  return (
    <div>
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-3xl font-medium sm:text-4xl text-gray-900">
          <FoldText text="Data Quality" />
        </h1>
        <p className="text-sm text-gray-500">Automated checks across all task log submissions.</p>
      </div>

      <div className="mb-4">
        <SegmentedTabs aria-label="Check" value={tab} onChange={setTab} options={TABS.map((t) => ({ ...t, count: counts[t.value] }))} />
      </div>

      <div className="overflow-hidden card">
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-900">{TABS.find((t) => t.value === tab)?.label}</h2>
              {count !== undefined && count > 0 && (
                <span className="rounded-full bg-status-danger-bg px-2 py-0.5 text-xs font-semibold text-status-danger-text">{count}</span>
              )}
            </div>
            <p className="mt-1 text-xs text-gray-500">{descriptions[tab]}</p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {tab === 'missing_task_id' && missingTaskId && missingTaskId.length > 0 && (
              <button
                onClick={() => handleDeleteAll(missingTaskId.map((row) => row.id))}
                disabled={deleteMutation.isPending}
                className="inline-flex min-h-8 items-center gap-1.5 text-xs font-medium text-status-danger-text hover:underline disabled:opacity-50 pointer-coarse:min-h-11"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                {deleteMutation.isPending ? 'Deleting...' : 'Delete All'}
              </button>
            )}
            {active.dataUpdatedAt > 0 && <span className="text-xs text-gray-400">{updatedAgo(active.dataUpdatedAt)}</span>}
            <button
              onClick={() => active.refetch()}
              disabled={active.isFetching}
              className="inline-flex min-h-8 items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-900 disabled:opacity-50 pointer-coarse:min-h-11"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${active.isFetching ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden />
              {active.isFetching ? 'Loading...' : 'Refresh'}
            </button>
          </div>
        </div>

        {active.isLoading && <div className="border-t border-gray-200 px-5 py-4 text-sm text-gray-400">Loading...</div>}
        {active.isError && (
          <div className="border-t border-gray-200 px-5 py-4 text-sm text-status-danger-text">
            {active.error instanceof Error ? active.error.message : 'Could not load this check.'}
          </div>
        )}
        {count === 0 && (
          <div className="border-t border-gray-200 px-5 py-4 text-sm text-status-success-text">No issues found.</div>
        )}
        {count !== undefined && count > 0 && <div className="border-t border-gray-200">{renderTable()}</div>}
      </div>

      {volumeTarget && (
        <Modal
          title={dayQuery.data ? `${dayQuery.data.length} tasks on ${volumeTarget.date}` : `Tasks on ${volumeTarget.date}`}
          onClose={() => setVolumeTarget(null)}
          maxWidthClassName="max-w-4xl"
        >
          <p className="mb-4 text-sm text-gray-500">
            {emailCell(volumeTarget.cb_email)}
            {' · in the order they were logged'}
          </p>
          {dayQuery.isLoading ? (
            <div className="text-sm text-gray-400">Loading...</div>
          ) : (
            <DataTable bare columns={volumeTaskColumns} data={dayQuery.data ?? []} getRowId={(r) => String(r.id)} />
          )}
        </Modal>
      )}

      {editTarget && <TaskSubmissionForm submission={editTarget} onSaved={refreshAfterChange} onClose={() => setEditTarget(null)} />}
    </div>
  )
}
