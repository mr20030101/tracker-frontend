import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, Pencil, Plus } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { confirmDialog } from '../lib/dialog'
import { remotasksDiffViewerUrl } from '../lib/remotasks'
import { addTaskAudit, deleteTaskAudit, fetchTaskAudits, STAGE_LABELS, updateTaskAudit, type TaskAudit, type TaskAuditInput } from '../lib/taskAudits'
import { contributorPath } from '../lib/urlRef'
import { usePageTitle } from '../lib/usePageTitle'
import type { User } from '../types'
import { AuditEntryModal } from '../components/AuditEntryModal'
import { Avatar } from '../components/Avatar'
import { DataTable } from '../components/DataTable'
import { Select } from '../components/Select'
import { CopyButton } from '../components/SubmissionDetailsModal'
import { SearchInput, SegmentedTabs, TableToolbar, toolbarControlClass } from '../components/TableToolbar'

type AuditFilter = 'all' | 'errors' | 'low'

interface Row extends TaskAudit {
  cb: User
}

const EVERYONE = 'everyone'

function StatTile({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">{label}</div>
      <div className="mt-1 text-3xl font-bold text-gray-900">{children}</div>
      {hint && <div className="mt-1 text-xs text-gray-500">{hint}</div>}
    </div>
  )
}

function ScorePill({ score }: { score: number }) {
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${
        score >= 4
          ? 'bg-status-success-bg text-status-success-text'
          : score === 3
            ? 'bg-status-warning-bg text-status-warning-text'
            : 'bg-status-danger-bg text-status-danger-text'
      }`}
    >
      Score {score}
    </span>
  )
}

export function Audits() {
  usePageTitle('Audits')
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const queryClient = useQueryClient()
  const [leadId, setLeadId] = useState(isAdmin ? EVERYONE : (user?.id ?? ''))
  const [cbFilter, setCbFilter] = useState('')
  const [filter, setFilter] = useState<AuditFilter>('all')
  const [search, setSearch] = useState('')
  // null: closed; 'new': adding one; otherwise the audit being edited.
  const [editing, setEditing] = useState<TaskAudit | 'new' | null>(null)

  // Same key as the Users page. A lead's RLS only returns their own team (and themselves).
  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => (await api.get<User[]>('/users')).data,
  })
  const { data: audits = [], isLoading: auditsLoading, error: auditsError } = useQuery({
    queryKey: ['task-audits'],
    queryFn: fetchTaskAudits,
  })

  const leadOptions = useMemo(
    () => [
      { value: EVERYONE, label: 'Every team' },
      ...(users ?? []).filter((u) => u.role === 'lead' || u.role === 'admin').map((u) => ({ value: u.id, label: `${u.name}'s team` })),
    ],
    [users],
  )

  const team = useMemo(
    () => (users ?? []).filter((u) => u.role === 'contributor' && !u.is_bot && (leadId === EVERYONE || u.lead_id === leadId)),
    [users, leadId],
  )

  const teamRows = useMemo<Row[]>(() => {
    const byId = new Map(team.map((u) => [u.id, u]))
    return audits.flatMap((a) => {
      const cb = byId.get(a.cb_user_id)
      return cb ? [{ ...a, cb }] : []
    })
  }, [audits, team])

  const cbOptions = useMemo(() => {
    const counts = new Map<string, number>()
    for (const r of teamRows) counts.set(r.cb.id, (counts.get(r.cb.id) ?? 0) + 1)
    return [{ value: '', label: 'All CBs' }, ...team.map((cb) => ({ value: cb.id, label: `${cb.name} (${counts.get(cb.id) ?? 0})` }))]
  }, [teamRows, team])

  const withErrors = teamRows.filter((r) => r.errors)
  const low = teamRows.filter((r) => r.score <= 3)
  const averageScore = teamRows.length ? teamRows.reduce((sum, r) => sum + r.score, 0) / teamRows.length : null
  const cbsAudited = new Set(teamRows.map((r) => r.cb.id)).size

  const shown = useMemo(() => {
    const term = search.trim().toLowerCase()
    return teamRows.filter(
      (r) =>
        (filter === 'all' || (filter === 'errors' ? Boolean(r.errors) : r.score <= 3)) &&
        (!cbFilter || r.cb.id === cbFilter) &&
        (!term ||
          r.task_id.toLowerCase().includes(term) ||
          r.cb.email.toLowerCase().includes(term) ||
          r.cb.name.toLowerCase().includes(term) ||
          (r.errors ?? '').toLowerCase().includes(term)),
    )
  }, [teamRows, filter, cbFilter, search])

  const save = useMutation({
    mutationFn: (input: TaskAuditInput) =>
      editing && editing !== 'new' ? updateTaskAudit(editing.id, input, user!.id) : addTaskAudit(input, user!.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['task-audits'] })
      setEditing(null)
    },
  })
  const remove = useMutation({
    mutationFn: (id: number) => deleteTaskAudit(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['task-audits'] })
      setEditing(null)
    },
  })

  function open(audit: TaskAudit | 'new') {
    save.reset()
    remove.reset()
    setEditing(audit)
  }

  async function handleDelete(audit: TaskAudit) {
    if (await confirmDialog(`Delete the audit of task ${audit.task_id}?`, { confirmLabel: 'Delete', danger: true })) {
      remove.mutate(audit.id)
    }
  }

  const columns = useMemo<ColumnDef<Row, any>[]>(
    () => [
      {
        id: 'cb',
        accessorFn: (r) => r.cb.name,
        header: 'CB',
        cell: ({ row }) => {
          const cb = row.original.cb
          return (
            <Link to={contributorPath(cb.email)} className="flex items-center gap-3 hover:underline">
              <Avatar name={cb.name} photoUrl={cb.avatar_url} size={28} />
              <div className="min-w-0">
                <div className="truncate font-medium text-gray-900">{cb.name}</div>
                <div className="truncate text-xs text-gray-400">{cb.email}</div>
              </div>
            </Link>
          )
        },
      },
      {
        id: 'task_id',
        accessorFn: (r) => r.task_id,
        header: 'Task ID',
        enableSorting: false,
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <a
              href={remotasksDiffViewerUrl(row.original.task_id)}
              target="_blank"
              rel="noreferrer"
              className="whitespace-nowrap font-mono text-xs text-sky-700 hover:underline"
            >
              {row.original.task_id}
            </a>
            <CopyButton text={row.original.task_id} />
          </div>
        ),
      },
      {
        id: 'project',
        accessorFn: (r) => r.project?.name ?? '',
        header: 'Project',
        cell: ({ row }) => (
          <div className="text-xs text-gray-500">
            <div>{row.original.project?.name ?? '—'}</div>
            {row.original.submission && (
              <div className="text-gray-400">
                {STAGE_LABELS[row.original.submission.stage]}
                {row.original.submission.date && ` · ${row.original.submission.date}`}
              </div>
            )}
          </div>
        ),
      },
      { id: 'score', accessorFn: (r) => r.score, header: 'Score', cell: ({ row }) => <ScorePill score={row.original.score} /> },
      {
        id: 'errors',
        accessorFn: (r) => r.errors ?? '',
        header: 'Errors',
        enableSorting: false,
        cell: ({ row }) =>
          row.original.errors ? (
            <div className="line-clamp-3 max-w-xs whitespace-pre-wrap wrap-break-word text-xs text-status-danger-text">{row.original.errors}</div>
          ) : (
            <span className="text-xs text-gray-400">None</span>
          ),
      },
      {
        id: 'audited',
        accessorFn: (r) => r.created_at,
        header: 'Audited',
        cell: ({ row }) => (
          <div className="whitespace-nowrap text-xs text-gray-500">
            <div>{new Date(row.original.created_at).toLocaleDateString()}</div>
            <div className="text-gray-400">{row.original.auditor?.name ?? '—'}</div>
          </div>
        ),
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        meta: { align: 'right' },
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-3 whitespace-nowrap">
            <a
              href={remotasksDiffViewerUrl(row.original.task_id)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-700 hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              Open in Remotasks
            </a>
            <button
              type="button"
              onClick={() => open(row.original)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-700 hover:underline"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden />
              Edit
            </button>
          </div>
        ),
      },
    ],
    // open only resets the mutations and sets state, so it's safe to leave out.
    [],
  )

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Audits</h1>
          <p className="max-w-2xl text-sm text-gray-500">
            Spot check the tasks your CBs logged. Add an entry for each one you audit: find the task by its ID or the CB's name, then give it a score and note the errors you found.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <Select
              value={leadId}
              onChange={(id) => {
                setLeadId(id)
                setCbFilter('')
              }}
              options={leadOptions}
              aria-label="Team"
              className={toolbarControlClass}
            />
          )}
          <button
            type="button"
            onClick={() => open('new')}
            disabled={team.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Add entry
          </button>
        </div>
      </div>

      {Boolean(auditsError) && (
        <div role="alert" className="mb-4 rounded-lg border border-status-danger-text/30 bg-status-danger-bg px-4 py-2.5 text-sm text-status-danger-text">
          Could not load audits: {(auditsError as Error).message}
        </div>
      )}

      {editing && (
        <AuditEntryModal
          team={team}
          auditedIds={new Set(audits.filter((a) => editing === 'new' || a.id !== editing.id).map((a) => a.task_submission_id))}
          existing={editing === 'new' ? null : editing}
          isPending={save.isPending || remove.isPending}
          error={save.error ?? remove.error}
          onSave={(input) => save.mutate(input)}
          onDelete={() => editing !== 'new' && void handleDelete(editing)}
          onClose={() => setEditing(null)}
        />
      )}

      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Audits" hint={`${cbsAudited} of ${team.length} CBs audited`}>
          {teamRows.length}
        </StatTile>
        <StatTile label="Average score" hint="Out of 5">
          {averageScore === null ? '—' : averageScore.toFixed(1)}
        </StatTile>
        <StatTile label="With errors" hint={teamRows.length ? `${Math.round((withErrors.length / teamRows.length) * 100)}% of audits` : undefined}>
          {withErrors.length}
        </StatTile>
        <StatTile label="Score 3 or lower" hint="Fixable, poor or spam">
          <span className={low.length > 0 ? 'text-status-danger-text' : ''}>{low.length}</span>
        </StatTile>
      </div>

      <DataTable
        columns={columns}
        data={shown}
        getRowId={(r) => String(r.id)}
        isLoading={usersLoading || auditsLoading}
        pageSize={25}
        emptyMessage={
          team.length === 0
            ? 'No CBs are on this team yet. Assign contributors to a lead from the Users page.'
            : teamRows.length === 0
              ? 'No audits yet. Press Add entry to audit a task.'
              : 'No audits match these filters.'
        }
        toolbar={
          <TableToolbar>
            <SegmentedTabs
              aria-label="Show"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'All', count: teamRows.length },
                { value: 'errors', label: 'With errors', count: withErrors.length },
                { value: 'low', label: 'Score 3 or lower', count: low.length },
              ]}
            />
            <Select value={cbFilter} onChange={setCbFilter} options={cbOptions} aria-label="CB" className={toolbarControlClass} />
            <SearchInput value={search} onChange={setSearch} placeholder="Search task ID, CB or errors..." />
          </TableToolbar>
        }
      />
    </div>
  )
}
