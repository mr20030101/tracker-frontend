import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { api, supabase } from '../lib/api'
import { AUDIT_CATEGORIES, auditCategory, fetchAuditLogs } from '../lib/auditLog'
import type { ActivityEvent, ActivityLog, AuditLog } from '../types'
import { Avatar } from '../components/Avatar'
import { Select } from '../components/Select'
import { SearchInput, TableToolbar, toolbarControlClass } from '../components/TableToolbar'
import { DataTable } from '../components/DataTable'
import { Modal } from '../components/Modal'

const EVENT_LABELS: Record<ActivityEvent, string> = {
  login: 'Signed in',
  login_failed: 'Sign-in failed',
  logout: 'Signed out',
}

const EVENT_STYLES: Record<ActivityEvent, string> = {
  login: 'bg-status-success-bg text-status-success-text',
  login_failed: 'bg-status-danger-bg text-status-danger-text',
  logout: 'bg-gray-100 text-gray-600',
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

type Tab = 'sign-ins' | 'actions'

export function ActivityLog() {
  const [tab, setTab] = useState<Tab>('sign-ins')

  return (
    <div>
      <div className="mb-4 flex rounded-lg border border-gray-200 bg-white p-1 w-fit">
        {(
          [
            ['sign-ins', 'Sign-ins'],
            ['actions', 'Admin actions'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium ${tab === value ? 'bg-accent text-accent-foreground' : 'text-gray-600'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'sign-ins' ? <SignInLog /> : <AuditTrail />}
    </div>
  )
}

function AuditTrail() {
  const [category, setCategory] = useState('all')
  const [search, setSearch] = useState('')

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['audit-logs'],
    queryFn: fetchAuditLogs,
    refetchInterval: 30_000,
  })

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (data ?? []).filter(
      (row) =>
        (category === 'all' || auditCategory(row.action) === category) &&
        (!term || row.summary.toLowerCase().includes(term) || (row.actor?.name ?? '').toLowerCase().includes(term)),
    )
  }, [data, category, search])

  const columns = useMemo<ColumnDef<AuditLog, any>[]>(
    () => [
      {
        id: 'actor',
        accessorFn: (row) => row.actor?.name ?? '',
        header: 'Who',
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <Avatar name={row.original.actor?.name ?? 'Unknown'} photoUrl={row.original.actor?.avatar_url} size={28} />
            <div className="min-w-0">
              <div className="truncate font-medium text-gray-900">{row.original.actor?.name ?? 'Deleted user'}</div>
              <div className="truncate text-xs text-gray-400">{row.original.actor?.email ?? '—'}</div>
            </div>
          </div>
        ),
      },
      {
        id: 'summary',
        accessorFn: (row) => row.summary,
        header: 'What',
        cell: ({ row }) => <span className="text-gray-700">{row.original.summary}</span>,
      },
      {
        id: 'category',
        accessorFn: (row) => auditCategory(row.action),
        header: 'Type',
        cell: ({ row }) => (
          <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
            {AUDIT_CATEGORIES.find((c) => c.value === auditCategory(row.original.action))?.label ?? 'Other'}
          </span>
        ),
      },
      {
        id: 'time',
        accessorFn: (row) => row.created_at,
        header: 'Time',
        cell: ({ row }) => <span className="whitespace-nowrap text-gray-500">{formatTimestamp(row.original.created_at)}</span>,
      },
    ],
    [],
  )

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">Admin Actions</h1>
          <p className="text-sm text-gray-500">
            What leads and admins changed: accounts, teams, requests, levels, targets, projects and hiring. Kept permanently.
          </p>
        </div>
      </div>

      {isError ? (
        <div className="rounded-xl border border-status-danger-text bg-status-danger-bg px-5 py-4 text-sm text-status-danger-text">
          Could not load the audit log: {(error as Error).message}
        </div>
      ) : (
        <DataTable
          toolbar={
            <TableToolbar>
              <SearchInput value={search} onChange={setSearch} aria-label="Search admin actions" />
              <Select
                value={category}
                onChange={setCategory}
                aria-label="Filter by action"
                options={[{ value: 'all', label: 'All actions' }, ...AUDIT_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))]}
                className={toolbarControlClass}
              />
            </TableToolbar>
          }
          columns={columns}
          data={rows}
          getRowId={(row) => String(row.id)}
          isLoading={isLoading}
          emptyMessage="No actions recorded yet."
        />
      )}
    </div>
  )
}

function SignInLog() {
  const queryClient = useQueryClient()
  const [eventFilter, setEventFilter] = useState<ActivityEvent | 'all'>('all')
  const [clearConfirm, setClearConfirm] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['activity-logs'],
    queryFn: async () => (await api.get<ActivityLog[]>('/activity-logs')).data,
    refetchInterval: 30_000,
  })

  const rows = useMemo(() => (data ?? []).filter((row) => eventFilter === 'all' || row.event === eventFilter), [data, eventFilter])

  const clearMutation = useMutation({
    mutationFn: async () => {
      // `id` is a non-null primary key, so this filter matches every row —
      // Postgres (via PostgREST) rejects a DELETE with no filter at all.
      const { error } = await supabase.from('activity_logs').delete().not('id', 'is', null)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['activity-logs'] })
      setClearConfirm(false)
    },
  })

  const columns = useMemo<ColumnDef<ActivityLog, any>[]>(
    () => [
      {
        id: 'user',
        accessorFn: (row) => row.user?.name ?? row.email ?? '',
        header: 'User',
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <Avatar name={row.original.user?.name ?? row.original.email ?? 'Unknown'} size={28} />
            <div>
              <div className="font-medium text-gray-900">{row.original.user?.name ?? 'Unknown'}</div>
              <div className="text-xs text-gray-400">{row.original.user?.email ?? row.original.email ?? '—'}</div>
            </div>
          </div>
        ),
      },
      {
        id: 'event',
        accessorFn: (row) => row.event,
        header: 'Event',
        cell: ({ row }) => (
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${EVENT_STYLES[row.original.event]}`}>
            {EVENT_LABELS[row.original.event]}
          </span>
        ),
      },
      {
        id: 'time',
        accessorFn: (row) => row.created_at,
        header: 'Time',
        cell: ({ row }) => <span className="text-gray-500">{formatTimestamp(row.original.created_at)}</span>,
      },
    ],
    [],
  )

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            Activity Log
          </h1>
          <p className="text-sm text-gray-500">Sign-in and sign-out activity across all logins.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setClearConfirm(true)}
            disabled={!data || data.length === 0}
            className="rounded-lg border border-status-danger-text/30 bg-white px-4 py-2 text-sm font-semibold text-status-danger-text hover:bg-status-danger-bg disabled:cursor-not-allowed disabled:opacity-50"
          >
            Clear log
          </button>
        </div>
      </div>

      <DataTable
        toolbar={
          <TableToolbar>
            <Select
              value={eventFilter}
              onChange={(value) => setEventFilter(value as ActivityEvent | 'all')}
              aria-label="Filter by event"
              options={[
                { value: 'all', label: 'All events' },
                { value: 'login', label: 'Signed in' },
                { value: 'login_failed', label: 'Sign-in failed' },
                { value: 'logout', label: 'Signed out' },
              ]}
              className={toolbarControlClass}
            />
          </TableToolbar>
        }
        columns={columns}
        data={rows}
        getRowId={(row) => String(row.id)}
        isLoading={isLoading}
        emptyMessage="No activity recorded yet."
      />

      {clearConfirm && (
        <Modal title="Clear the activity log?" onClose={() => setClearConfirm(false)}>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-gray-600">
              This permanently deletes all <span className="font-medium text-gray-900">{data?.length ?? 0}</span> sign-in and
              sign-out records for every login, including any hidden by your current filter. This cannot be undone.
            </p>
            {clearMutation.isError && (
              <div className="text-sm text-status-danger-text">
                {clearMutation.error instanceof Error ? clearMutation.error.message : 'Could not clear the log.'}
              </div>
            )}
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setClearConfirm(false)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => clearMutation.mutate()}
                disabled={clearMutation.isPending}
                className="rounded-lg bg-status-danger-text px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {clearMutation.isPending ? 'Clearing...' : 'Clear Log'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
