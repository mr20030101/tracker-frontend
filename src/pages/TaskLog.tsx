import { useState } from 'react'
import { FoldText } from '../components/FoldText'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Download, Eye, FileUp, Image, Pencil, Plus, Trash2 } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, supabase, teamMemberIds } from '../lib/api'
import { sanitiseOrTerm } from '../lib/sanitiseOrTerm'
import { useAuth } from '../lib/auth'
import { toISODate } from '../lib/week'
import type { Paginated, Project, Stage, SubmissionStatus, TaskSubmission } from '../types'
import { BackupFormFailed, StatusPill } from '../components/StatusPill'
import { TaskTimer } from '../components/TaskTimer'
import { Avatar } from '../components/Avatar'
import { ActionsMenu } from '../components/ActionsMenu'
import { Select } from '../components/Select'
import { DateRangeInput, FilterAction, FilterBar, FilterField, SearchInput, TableCard, toolbarControlClass } from '../components/TableToolbar'
import { SubmissionDetailsModal } from '../components/SubmissionDetailsModal'
import { TaskSubmissionForm } from '../components/TaskSubmissionForm'
import { SortableHeader } from '../components/SortableHeader'
import { BulkImportModal } from '../components/BulkImportModal'
import { ContributorWorkPanel } from '../components/ContributorWorkPanel'
import { downloadCsv } from '../lib/csv'
import { contributorPath } from '../lib/urlRef'
import { confirmDialog, alertDialog } from '../lib/dialog'
import { fetchAllPages } from '../lib/fetchAll'
import { usePageTitle } from '../lib/usePageTitle'
import { remotasksDiffViewerUrl } from '../lib/remotasks'
import { STAGE_LABELS } from '../lib/taskAudits'
import { useMessaging } from '../lib/messagingContext'

const MANAGER_ROLES = ['admin', 'lead']

type SortKey = 'cb_email' | 'status' | 'date'

const STAGES: { value: Stage | ''; label: string }[] = [
  { value: '', label: 'All Stages' },
  { value: 'attempt', label: 'Attempt' },
  { value: 'l0', label: 'L0' },
  { value: 'l1', label: 'L1' },
  { value: 'l10', label: 'L10' },
]

const STATUS_OPTIONS: { value: SubmissionStatus; label: string }[] = [
  { value: 'submitted', label: 'Submitted' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'empty', label: 'Empty' },
  { value: 'rejected', label: 'Rejected/SBQ' },
  { value: 'expired', label: 'Expired' },
  { value: 'claimed_by_another', label: 'Claimed by Another Person' },
]

export function TaskLog() {
  usePageTitle('Task Log')
  const { user } = useAuth()
  const isManager = Boolean(user && MANAGER_ROLES.includes(user.role))
  return isManager ? <ManagerTaskLog /> : <ContributorTaskLog />
}

// A contributor's own goal ring, charts and day/week/month submissions table — the same panel
// shown on the profile page when a lead/admin reviews someone else.
function ContributorTaskLog() {
  const { user } = useAuth()
  return (
    <div>
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-3xl font-medium sm:text-4xl text-gray-900">
          <FoldText text="Task Log" />
        </h1>
        <p className="text-sm text-gray-500">Your submissions, goals and CTS status.</p>
      </div>
      {user?.email && <ContributorWorkPanel email={user.email} contributorName={user.name ?? user.email} canEdit />}
    </div>
  )
}

// The global, filterable, multi-contributor log — for a lead/admin reviewing everyone's work.
function ManagerTaskLog() {
  const { user: me } = useAuth()
  const isAdmin = me?.role === 'admin'
  // Contributors' names and photos, from the directory the app already loads.
  const { usersById } = useMessaging()
  const { user } = useAuth()
  const isManager = Boolean(user && MANAGER_ROLES.includes(user.role))
  const [stage, setStage] = useState<Stage | ''>('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<SubmissionStatus | ''>('')
  const [projectId, setProjectId] = useState('')
  const [leadId, setLeadId] = useState('')
  // Today only by default, so the log opens with one day's tasks instead of everything; leads pick
  // other dates (or empty both for all of them) when they need more.
  const today = toISODate(new Date())
  const [dateFrom, setDateFrom] = useState(today)
  const [dateTo, setDateTo] = useState(today)
  const [page, setPage] = useState(1)
  const [formTarget, setFormTarget] = useState<'new' | TaskSubmission | null>(null)
  const [editingStatusId, setEditingStatusId] = useState<number | null>(null)
  const [viewingId, setViewingId] = useState<number | null>(null)
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'date', dir: 'desc' })
  const [bulkImportOpen, setBulkImportOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const queryClient = useQueryClient()

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => (await api.get<Project[]>('/projects')).data,
  })

  // Admins can narrow it to one lead's team; a lead only sees their own anyway.
  const { data: leads = [] } = useQuery({
    queryKey: ['task-log-leads'],
    queryFn: async () => {
      const { data: rows, error } = await supabase.from('profiles').select('id, name').eq('role', 'lead').eq('is_active', true).order('name')
      if (error) throw error
      return rows as { id: string; name: string }[]
    },
    enabled: isAdmin,
    staleTime: 10 * 60_000,
  })

  const { data, isLoading } = useQuery({
    queryKey: ['task-submissions', stage, search, dateFrom, dateTo, status, projectId, leadId, page, sort],
    queryFn: async () =>
      (
        await api.get<Paginated<TaskSubmission>>('/task-submissions', {
          params: {
            stage: stage || undefined,
            search: search || undefined,
            date_from: dateFrom || undefined,
            date_to: dateTo || undefined,
            status: status || undefined,
            project_id: projectId || undefined,
            lead_id: leadId || undefined,
            page,
            sort: sort.key,
            sort_dir: sort.dir,
          },
        })
      ).data,
  })

  // Looked up by id each render, so the modal shows the row's current values.
  const viewing = viewingId === null ? null : (data?.data.find((r) => r.id === viewingId) ?? null)

  function toggleSort(key: SortKey) {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
    setPage(1)
  }

  async function handleExport() {
    setExporting(true)
    try {
      // A fresh query per page, fetched in pages: the whole log is more than the 1,000 rows one
      // request returns, so a plain query exported only part of it (see fetchAll).
      const teamIds = leadId ? await teamMemberIds(leadId) : null
      const pageOf = (from: number, to: number) => {
        let query = supabase
          .from('task_submissions')
          .select('date, cb_email, task_id, project_id, stage, status, notes, submitted_at, snipboard_url')
          .order(sort.key, { ascending: sort.dir === 'asc' })
          .order('id')
        if (stage) query = query.eq('stage', stage)
        if (search) {
          const term = sanitiseOrTerm(search)
          query = query.or(`cb_email.ilike.%${term}%,task_id.ilike.%${term}%`)
        }
        if (dateFrom) query = query.gte('date', dateFrom)
        if (dateTo) query = query.lte('date', dateTo)
        if (status) query = query.eq('status', status)
        if (projectId) query = query.eq('project_id', Number(projectId))
        if (teamIds) query = query.in('user_id', teamIds)
        return query.range(from, to)
      }
      const rows = await fetchAllPages(pageOf)

      const projectById = new Map((projects ?? []).map((p) => [p.id, p.name]))
      downloadCsv(
        `task-log-${toISODate(new Date())}.csv`,
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
      alertDialog(err instanceof Error ? err.message : 'Export failed.')
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
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-medium sm:text-4xl text-gray-900">
            <FoldText text="Task Log" />
          </h1>
          <p className="text-sm text-gray-500">
            {data ? `${data.total} ${isManager ? 'total' : 'of your'} submissions` : 'Loading...'}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setBulkImportOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            <FileUp className="h-4 w-4" aria-hidden />
            Bulk Import
          </button>
          <button
            onClick={() => setFormTarget('new')}
            className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Add Submission
          </button>
        </div>
      </div>

      <TableCard
        toolbar={
          <FilterBar
            active={[stage, search, status, projectId, leadId].filter(Boolean).length + (dateFrom !== today || dateTo !== today ? 1 : 0)}
            onReset={() => {
              setStage('')
              setSearch('')
              setStatus('')
              setProjectId('')
              setLeadId('')
              setDateFrom(today)
              setDateTo(today)
              setPage(1)
            }}
            actions={
              isManager && (
                <FilterAction onClick={handleExport} disabled={exporting}>
                  <Download className="h-3.5 w-3.5" aria-hidden />
                  {exporting ? 'Exporting...' : 'Export CSV'}
                </FilterAction>
              )
            }
          >
            {isManager && (
              <FilterField label="Search" id="tasklog-search">
                <SearchInput
                  id="tasklog-search"
                  placeholder="CB email or Task ID"
                  value={search}
                  onChange={(value) => {
                    setSearch(value)
                    setPage(1)
                  }}
                />
              </FilterField>
            )}
            <FilterField label="Date" id="tasklog-from">
              <DateRangeInput
                id="tasklog-from"
                from={dateFrom}
                to={dateTo}
                onFromChange={(value) => {
                  setDateFrom(value)
                  setPage(1)
                }}
                onToChange={(value) => {
                  setDateTo(value)
                  setPage(1)
                }}
              />
            </FilterField>
            <FilterField label="Stage" id="tasklog-stage" set={Boolean(stage)}>
              <Select
                id="tasklog-stage"
                fullWidth
                value={stage}
                onChange={(value) => {
                  setStage(value as Stage | '')
                  setPage(1)
                }}
                options={STAGES}
                className={toolbarControlClass}
              />
            </FilterField>
            <FilterField label="Status" id="tasklog-status" set={Boolean(status)}>
              <Select
                id="tasklog-status"
                fullWidth
                value={status}
                onChange={(value) => {
                  setStatus(value as SubmissionStatus | '')
                  setPage(1)
                }}
                options={[{ value: '', label: 'All Statuses' }, ...STATUS_OPTIONS]}
                className={toolbarControlClass}
              />
            </FilterField>
            <FilterField label="Project" id="tasklog-project" set={Boolean(projectId)}>
              <Select
                id="tasklog-project"
                fullWidth
                value={projectId}
                onChange={(value) => {
                  setProjectId(value)
                  setPage(1)
                }}
                options={[{ value: '', label: 'All Projects' }, ...(projects ?? []).map((p) => ({ value: String(p.id), label: p.name }))]}
                className={toolbarControlClass}
              />
            </FilterField>
            {isAdmin && (
              <FilterField label="Team" id="tasklog-team" set={Boolean(leadId)}>
                <Select
                  id="tasklog-team"
                  fullWidth
                  value={leadId}
                  onChange={(value) => {
                    setLeadId(value)
                    setPage(1)
                  }}
                  options={[{ value: '', label: 'All Teams' }, ...leads.map((l) => ({ value: l.id, label: `${l.name}'s team` }))]}
                  className={toolbarControlClass}
                />
              </FilterField>
            )}
          </FilterBar>
        }
        footer={
          data && (
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-gray-200 px-5 py-3 text-xs text-gray-500">
              <span>
                Showing {data.from ?? 0}–{data.to ?? 0} of {data.total}
              </span>
              <div className="flex items-center gap-3">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 font-medium text-gray-600 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
                  Previous
                </button>
                <span>
                  Page {page} of {Math.max(1, data.last_page)}
                </span>
                <button
                  disabled={page >= data.last_page}
                  onClick={() => setPage((p) => p + 1)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 font-medium text-gray-600 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            </div>
          )
        }
      >
        <table className="w-full min-w-[56rem] text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
            <tr>
              <SortableHeader
                label="CB Email"
                active={sort.key === 'cb_email'}
                dir={sort.dir}
                onClick={() => toggleSort('cb_email')}
              />
              <th className="px-5 py-3">Task ID</th>
              <th className="px-5 py-3">Project</th>
              <th className="px-5 py-3">Stage</th>
              <SortableHeader
                label="Status"
                active={sort.key === 'status'}
                dir={sort.dir}
                onClick={() => toggleSort('status')}
              />
              <th className="px-5 py-3">Time</th>
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
              <tr key={row.id} onClick={() => setViewingId(row.id)} className="cursor-pointer hover:bg-gray-50">
                <td className="max-w-64 px-5 py-3">
                  <Link
                    to={contributorPath(row.cb_email)}
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-3 hover:underline"
                  >
                    <Avatar name={usersById.get(row.user_id ?? '')?.name ?? row.cb_email} photoUrl={usersById.get(row.user_id ?? '')?.avatar_url} size={28} />
                    <span className="min-w-0">
                      {usersById.get(row.user_id ?? '')?.name && (
                        <span className="block truncate font-medium text-gray-900">{usersById.get(row.user_id ?? '')?.name}</span>
                      )}
                      <span className="block truncate text-xs text-gray-500">{row.cb_email}</span>
                    </span>
                  </Link>
                </td>
                <td className="whitespace-nowrap px-5 py-3 font-mono text-xs" onClick={(e) => e.stopPropagation()}>
                  <span className="inline-flex items-center gap-1.5">
                    {row.task_id ? (
                      <a href={remotasksDiffViewerUrl(row.task_id)} target="_blank" rel="noreferrer" className="text-sky-700 hover:underline">
                        {row.task_id}
                      </a>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                    {row.snipboard_url && (
                      <a href={row.snipboard_url} target="_blank" rel="noreferrer" title="View screenshot" className="text-gray-400 hover:text-sky-700">
                        <Image className="h-3.5 w-3.5" aria-label="Screenshot" />
                      </a>
                    )}
                  </span>
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-gray-700">{row.project?.name ?? <span className="text-gray-400">—</span>}</td>
                <td className="whitespace-nowrap px-5 py-3 text-gray-600">{STAGE_LABELS[row.stage] ?? row.stage}</td>
                <td className="whitespace-nowrap px-5 py-3" onClick={(e) => e.stopPropagation()}>
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
                    <BackupFormFailed task={row} />
                  </div>
                </td>
                {/* Time on the task's timer, ticking while it runs. Started and paused from the task itself, not here. */}
                <td className="whitespace-nowrap px-5 py-3">
                  <TaskTimer task={row} canControl={false} />
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => setViewingId(row.id)}
                      aria-label="Details"
                      title="Details"
                      className="inline-flex h-8 w-8 pointer-coarse:h-11 pointer-coarse:w-11 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition-colors duration-100 hover:bg-gray-50 hover:text-gray-900"
                    >
                      <Eye className="h-4 w-4" aria-hidden />
                    </button>
                    <ActionsMenu
                      items={[
                        { label: 'Edit', icon: Pencil, onClick: () => setFormTarget(row) },
                        {
                          label: 'Delete',
                          icon: Trash2,
                          variant: 'danger',
                          onClick: async () => {
                            if (await confirmDialog('Delete this submission?', { confirmLabel: 'Delete', danger: true })) {
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
      </TableCard>

      {viewing && (
        <SubmissionDetailsModal
          submission={viewing}
          onClose={() => setViewingId(null)}
          onEdit={() => {
            setViewingId(null)
            setFormTarget(viewing)
          }}
          onDelete={async () => {
            if (await confirmDialog('Delete this submission?', { confirmLabel: 'Delete', danger: true })) {
              deleteMutation.mutate(viewing.id)
              setViewingId(null)
            }
          }}
        />
      )}

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
