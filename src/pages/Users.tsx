import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef, RowSelectionState } from '@tanstack/react-table'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { isOnline } from '../lib/presence'
import type { User } from '../types'
import { Modal } from '../components/Modal'
import { Avatar } from '../components/Avatar'
import { Combobox } from '../components/Combobox'
import { DataTable } from '../components/DataTable'
import { ActionsMenu } from '../components/ActionsMenu'
import { Select } from '../components/Select'
import { BulkImportUsersModal } from '../components/BulkImportUsersModal'

const ROLES: User['role'][] = ['contributor', 'lead', 'admin']
const ROLE_OPTIONS = ROLES.map((r) => ({ value: r, label: r.charAt(0).toUpperCase() + r.slice(1) }))
const DEFAULT_PASSWORD = 'password'

type StatusFilter = '' | 'active' | 'disabled'
type Notice = { tone: 'success' | 'error'; text: string }
type BulkJob = { ids: string[]; label: string; apply: (id: string) => Promise<unknown> }

const NOTICE_CLASSES: Record<Notice['tone'], string> = {
  success: 'border-status-success-text/30 bg-status-success-bg text-status-success-text',
  error: 'border-status-danger-text/30 bg-status-danger-bg text-status-danger-text',
}

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`
// api.ts throws Supabase's own error objects, which aren't always Error instances.
const errorMessage = (reason: unknown, fallback: string) =>
  (typeof reason === 'object' && reason !== null && 'message' in reason && String(reason.message)) || fallback

function formatLastSeen(lastSeenAt: string | null) {
  if (!lastSeenAt) return 'Never signed in'
  const diffMs = Date.now() - new Date(lastSeenAt).getTime()
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

const emptyForm = { name: '', email: '', password: DEFAULT_PASSWORD, role: 'contributor' as User['role'], shift: '' }

export function Users() {
  const { user: currentUser } = useAuth()
  const isAdmin = currentUser?.role === 'admin'
  const queryClient = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [bulkImporting, setBulkImporting] = useState(false)
  const [resetTarget, setResetTarget] = useState<User | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null)
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [resetPassword, setResetPassword] = useState('')
  // Modal forms report their own failures inline; everything else reports here.
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  // Search stays local (it changes per keystroke); the other filters live in the
  // URL so a reload or a shared link keeps the view.
  const [search, setSearch] = useState(searchParams.get('search') ?? '')
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const normalizedSearch = search.trim().toLowerCase()

  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => (await api.get<User[]>('/users')).data,
    refetchInterval: 30_000,
  })

  const people = useMemo(() => (data ?? []).filter((u) => u.id !== currentUser?.id), [data, currentUser?.id])
  const leads = useMemo(() => (data ?? []).filter((u) => u.role === 'lead'), [data])
  const leadOptions = useMemo(() => leads.map((lead) => ({ value: lead.id, label: lead.name })), [leads])
  const leadNameById = useMemo(() => new Map((data ?? []).map((u) => [u.id, u.name])), [data])

  const roleParam = searchParams.get('role')
  // A lead only ever sees their own contributors, so role and lead filters (and any
  // stale ?role= / ?lead= in the URL) are admin-only.
  const roleFilter = isAdmin ? (ROLES.find((r) => r === roleParam) ?? '') : ''
  const statusParam = searchParams.get('status')
  const statusFilter: StatusFilter = statusParam === 'active' || statusParam === 'disabled' ? statusParam : ''
  const leadParam = searchParams.get('lead') ?? ''
  const leadFilter = isAdmin && (leadParam === 'none' || leads.some((lead) => lead.id === leadParam)) ? leadParam : ''

  function setFilter(key: 'role' | 'status' | 'lead', value: string) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value) next.set(key, value)
        else next.delete(key)
        return next
      },
      { replace: true },
    )
    setRowSelection({})
  }

  function notifyError(reason: unknown, fallback: string) {
    setNotice({ tone: 'error', text: errorMessage(reason, fallback) })
  }

  // Success notices fade on their own; errors stay until dismissed.
  useEffect(() => {
    if (notice?.tone !== 'success') return
    const timer = window.setTimeout(() => setNotice(null), 6000)
    return () => window.clearTimeout(timer)
  }, [notice])

  const createMutation = useMutation({
    mutationFn: async () => api.post('/users', form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setNotice({ tone: 'success', text: `Added ${form.name}. They'll be asked to choose a new password when they first sign in.` })
      setAdding(false)
      setForm(emptyForm)
      setError(null)
    },
    onError: (mutationError: Error) => setError(mutationError.message || 'Could not create this login.'),
  })

  const roleMutation = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: User['role'] }) => api.patch(`/users/${id}`, { role }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
    onError: (mutationError: Error) => notifyError(mutationError, 'Could not change that role.'),
  })

  const leadMutation = useMutation({
    mutationFn: async ({ id, leadId }: { id: string; leadId: string | null }) =>
      api.patch(`/users/${id}`, { lead_id: leadId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
    onError: (mutationError: Error) => notifyError(mutationError, 'Could not change that lead.'),
  })

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch(`/users/${id}`, { is_active: isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
    onError: (mutationError: Error) => notifyError(mutationError, 'Could not update that login.'),
  })

  const deleteMutation = useMutation({
    mutationFn: async (u: User) => api.delete(`/users/${u.id}`),
    onSuccess: (_result, u) => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setNotice({ tone: 'success', text: `${u.name}'s login was deleted.` })
      setError(null)
      setDeleteTarget(null)
    },
    onError: (mutationError: Error) => setError(mutationError.message || 'Could not delete this login.'),
  })

  const resetMutation = useMutation({
    mutationFn: async () =>
      (await api.patch<{ id: string; emailed_to?: string; email_error?: string }>(`/users/${resetTarget!.id}`, { password: resetPassword, email: resetTarget!.email })).data,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      // The password is changed either way; the notice says whether the new one was also emailed to them.
      setNotice(
        result.email_error
          ? {
              tone: 'error',
              text: `Password reset for ${resetTarget!.name}, but the email couldn't be sent (${result.email_error}) Tell them the new password yourself.`,
            }
          : {
              tone: 'success',
              text: `Password reset for ${resetTarget!.name}.${result.emailed_to ? ` We emailed the new password to ${result.emailed_to}.` : ''} They'll be asked to choose a new one when they next sign in.`,
            },
      )
      setResetTarget(null)
      setResetPassword('')
      setError(null)
    },
    onError: (mutationError: Error) => setError(mutationError.message || 'Could not reset this password.'),
  })

  // Every bulk action goes through here so a partial failure is reported rather
  // than lost: the logins that failed stay selected for a retry.
  const bulkMutation = useMutation({
    mutationFn: async ({ ids, apply }: BulkJob) => {
      const results = await Promise.allSettled(ids.map(apply))
      const failedIds = ids.filter((_, i) => results[i].status === 'rejected')
      const firstFailure = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')
      return { failedIds, reason: firstFailure ? errorMessage(firstFailure.reason, '') : '' }
    },
    onSuccess: ({ failedIds, reason }, { ids, label }) => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      const done = ids.length - failedIds.length
      setRowSelection(Object.fromEntries(failedIds.map((id) => [id, true])))
      setBulkDeleteConfirm(false)
      setError(null)
      setNotice(
        failedIds.length === 0
          ? { tone: 'success', text: `${label} ${plural(done, 'login')}.` }
          : {
              tone: 'error',
              text: `${label} ${done} of ${plural(ids.length, 'login')}. ${failedIds.length} failed${reason ? `: ${reason}` : ''}. They're still selected so you can retry.`,
            },
      )
    },
    onError: (mutationError: Error) => {
      setBulkDeleteConfirm(false)
      notifyError(mutationError, 'Could not update those logins.')
    },
  })

  function bulkSetRole(role: User['role']) {
    bulkMutation.mutate({
      ids: selectedIds,
      label: `Set role to ${role} for`,
      apply: (id) => api.patch(`/users/${id}`, { role }),
    })
  }

  function bulkSetLead(leadId: string | null) {
    bulkMutation.mutate({
      ids: selectedIds,
      label: leadId ? `Assigned ${leadNameById.get(leadId) ?? 'the lead'} to` : 'Removed the lead from',
      apply: (id) => api.patch(`/users/${id}`, { lead_id: leadId }),
    })
  }

  function bulkSetActive(isActive: boolean) {
    bulkMutation.mutate({
      ids: selectedIds,
      label: isActive ? 'Enabled' : 'Disabled',
      apply: (id) => api.patch(`/users/${id}`, { is_active: isActive }),
    })
  }

  function openAdd() {
    setError(null)
    setAdding(true)
  }

  function openReset(u: User) {
    setError(null)
    setResetPassword('')
    setResetTarget(u)
  }

  function handleCreate(e: FormEvent) {
    e.preventDefault()
    setError(null)
    // manage-user upserts by email, so an existing address would silently have
    // its password, name and role overwritten. Stop that here.
    const email = form.email.trim().toLowerCase()
    const existing = (data ?? []).find((u) => u.email.toLowerCase() === email)
    if (existing) {
      setError(`${existing.name} already has a login with this email. Use Reset Password from their row instead.`)
      return
    }
    createMutation.mutate()
  }

  function handleReset(e: FormEvent) {
    e.preventDefault()
    resetMutation.mutate()
  }

  function handleDelete(e: FormEvent) {
    e.preventDefault()
    if (deleteTarget) deleteMutation.mutate(deleteTarget)
  }

  function handleBulkDelete(e: FormEvent) {
    e.preventDefault()
    bulkMutation.mutate({ ids: selectedIds, label: 'Deleted', apply: (id) => api.delete(`/users/${id}`) })
  }

  const rows = people
    .filter((u) => !normalizedSearch || u.name.toLowerCase().includes(normalizedSearch) || u.email.toLowerCase().includes(normalizedSearch))
    .filter((u) => !roleFilter || u.role === roleFilter)
    .filter((u) => !statusFilter || (statusFilter === 'active' ? u.is_active : !u.is_active))
    .filter((u) => !leadFilter || (leadFilter === 'none' ? !u.lead_id : u.lead_id === leadFilter))

  // Drop ids that vanished on a refetch (e.g. deleted elsewhere) so the count and bulk actions match what's on screen.
  const visibleIds = new Set(rows.map((u) => u.id))
  const selectedIds = Object.keys(rowSelection).filter((id) => rowSelection[id] && visibleIds.has(id))

  const hasActiveFilters = Boolean(search || roleFilter || statusFilter || leadFilter)

  const activeCount = people.filter((u) => u.is_active).length
  const statusTabs: { value: StatusFilter; label: string; count: number }[] = [
    { value: '', label: 'All', count: people.length },
    { value: 'active', label: 'Active', count: activeCount },
    { value: 'disabled', label: 'Disabled', count: people.length - activeCount },
  ]

  function clearFilters() {
    setSearch('')
    setSearchParams({}, { replace: true })
    setRowSelection({})
  }

  const columns = useMemo<ColumnDef<User, any>[]>(
    () => [
      {
        id: 'select',
        header: ({ table }) => (
          <input
            type="checkbox"
            aria-label="Select all logins matching these filters"
            checked={table.getIsAllRowsSelected()}
            ref={(el) => {
              if (el) el.indeterminate = table.getIsSomeRowsSelected()
            }}
            onChange={table.getToggleAllRowsSelectedHandler()}
            className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent"
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            aria-label={`Select ${row.original.name}`}
            checked={row.getIsSelected()}
            onChange={row.getToggleSelectedHandler()}
            className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent"
          />
        ),
        enableSorting: false,
      },
      {
        id: 'name',
        accessorFn: (u) => u.name,
        header: 'Name',
        cell: ({ row }) => {
          const u = row.original
          const opensTeam = isAdmin && u.role === 'lead'
          return (
            <Link
              to={opensTeam ? `/leads/${u.id}` : `/contributors/${encodeURIComponent(u.email)}`}
              title={opensTeam ? `View ${u.name}'s team` : undefined}
              className="flex items-center gap-3 hover:underline"
            >
              <Avatar name={u.name} photoUrl={u.avatar_url} size={28} />
              <div>
                <div className="font-medium text-gray-900">{u.name}</div>
                <div className="text-xs text-gray-400">{u.email}</div>
              </div>
            </Link>
          )
        },
      },
      // A lead's list is only their own contributors, so a Role or Lead column would
      // repeat the same value on every row. Only admins get them.
      ...(isAdmin
        ? [
            {
              id: 'role',
              accessorFn: (u: User) => u.role,
              header: 'Role',
              cell: ({ row }) => {
                const u = row.original
                return (
                  <Select
                    value={u.role}
                    onChange={(value) => roleMutation.mutate({ id: u.id, role: value as User['role'] })}
                    options={ROLE_OPTIONS}
                    className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs outline-none focus:border-accent"
                  />
                )
              },
            } satisfies ColumnDef<User, any>,
            {
              id: 'lead',
              // Unassigned sorts first, so one click brings the logins that need a lead to the top.
              accessorFn: (u: User) => (u.lead_id ? (leadNameById.get(u.lead_id) ?? '') : ''),
              header: 'Lead',
              cell: ({ row }) => {
                const u = row.original
                return (
                  <Combobox
                    value={u.lead_id ?? ''}
                    onChange={(leadId) => leadMutation.mutate({ id: u.id, leadId: leadId || null })}
                    options={leadOptions.filter((lead) => lead.value !== u.id)}
                    placeholder="Search leads..."
                    className="max-w-40"
                  />
                )
              },
            } satisfies ColumnDef<User, any>,
          ]
        : []),
      {
        id: 'status',
        accessorFn: (u) => Number(u.is_active),
        header: 'Status',
        cell: ({ row }) => {
          const u = row.original
          return (
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                u.is_active ? 'bg-status-success-bg text-status-success-text' : 'bg-status-danger-bg text-status-danger-text'
              }`}
            >
              {u.is_active ? 'Active' : 'Disabled'}
            </span>
          )
        },
      },
      {
        id: 'session',
        accessorFn: (u) => (u.last_seen_at ? new Date(u.last_seen_at).getTime() : 0),
        header: 'Session',
        cell: ({ row }) => {
          const u = row.original
          const online = isOnline(u.last_seen_at)
          return (
            <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
              <span className={`h-2 w-2 rounded-full ${online ? 'bg-status-success-text' : 'bg-gray-300'}`} />
              {online ? 'Online' : formatLastSeen(u.last_seen_at)}
            </span>
          )
        },
      },
      {
        id: 'actions',
        header: 'Actions',
        enableSorting: false,
        meta: { align: 'right' },
        cell: ({ row }) => {
          const u = row.original
          const isSelf = u.id === currentUser?.id
          return (
            <div className="flex justify-end">
              <ActionsMenu
                items={[
                  {
                    label: u.is_active ? 'Disable' : 'Enable',
                    variant: u.is_active ? 'danger' : 'default',
                    onClick: () => toggleActiveMutation.mutate({ id: u.id, isActive: !u.is_active }),
                  },
                  {
                    label: 'Reset Password',
                    onClick: () => openReset(u),
                  },
                  {
                    label: 'Delete',
                    variant: 'danger',
                    disabled: isSelf || deleteMutation.isPending,
                    title: isSelf ? 'You cannot delete your own account.' : undefined,
                    onClick: () => {
                      setError(null)
                      setDeleteTarget(u)
                    },
                  },
                ]}
              />
            </div>
          )
        },
      },
    ],
    [isAdmin, leadOptions, leadNameById, currentUser, roleMutation, leadMutation, toggleActiveMutation, deleteMutation],
  )

  const bulkBusy = bulkMutation.isPending
  const selectClass = 'rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent'
  const bulkSelectClass = 'rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-accent'

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="text-sm text-gray-500">
            {isAdmin ? 'Manage CB logins, roles, and passwords.' : "Manage your team's logins and passwords."}
          </p>
          <p className="mt-1 text-xs text-gray-400">New accounts default to: {DEFAULT_PASSWORD}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setBulkImporting(true)}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50"
          >
            Bulk Import
          </button>
          <button onClick={openAdd} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground">
            + Add Login
          </button>
        </div>
      </div>

      {notice && (
        <div
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className={`mb-4 flex items-start justify-between gap-3 rounded-lg border px-4 py-2.5 text-sm ${NOTICE_CLASSES[notice.tone]}`}
        >
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} className="opacity-60 hover:opacity-100" aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label="Filter by status" className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
          {statusTabs.map((tab) => (
            <button
              key={tab.value}
              role="tab"
              aria-selected={statusFilter === tab.value}
              onClick={() => setFilter('status', tab.value)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                statusFilter === tab.value ? 'bg-accent-bg text-accent-foreground' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {tab.label} <span className={statusFilter === tab.value ? 'opacity-70' : 'text-gray-400'}>{tab.count}</span>
            </button>
          ))}
        </div>
        <input
          type="search"
          placeholder="Search by name or email..."
          aria-label="Search logins"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setRowSelection({})
          }}
          className={`w-64 ${selectClass}`}
        />
        {isAdmin && (
          <>
            <Select
              value={roleFilter}
              aria-label="Filter by role"
              onChange={(value) => setFilter('role', value)}
              options={[{ value: '', label: 'All Roles' }, ...ROLE_OPTIONS]}
              className={selectClass}
            />
            <Select
              value={leadFilter}
              aria-label="Filter by lead"
              onChange={(value) => setFilter('lead', value)}
              options={[{ value: '', label: 'All Leads' }, { value: 'none', label: 'No Lead Assigned' }, ...leadOptions]}
              className={selectClass}
            />
          </>
        )}
        {hasActiveFilters && (
          <button onClick={clearFilters} className="text-sm font-medium text-sky-700 hover:underline">
            Clear filters
          </button>
        )}
        {!isLoading && (
          <span className="ml-auto text-xs text-gray-400">
            {rows.length === people.length ? plural(people.length, 'login') : `${rows.length} of ${plural(people.length, 'login')}`}
          </span>
        )}
      </div>

      {selectedIds.length > 0 && (
        <div className="sticky top-0 z-10 mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 shadow-sm">
          <span className="text-sm font-medium text-gray-700">{selectedIds.length} selected</span>
          {isAdmin && (
            <Select
              value=""
              placeholder="Set role..."
              aria-label="Set role for selected logins"
              disabled={bulkBusy}
              onChange={(value) => bulkSetRole(value as User['role'])}
              options={ROLE_OPTIONS}
              className={bulkSelectClass}
            />
          )}
          {isAdmin && (
            <Select
              value=""
              placeholder="Set lead..."
              aria-label="Set lead for selected logins"
              disabled={bulkBusy}
              onChange={(value) => bulkSetLead(value === '__none__' ? null : value)}
              options={[{ value: '__none__', label: '— No lead —' }, ...leadOptions]}
              className={bulkSelectClass}
            />
          )}
          <button
            onClick={() => bulkSetActive(true)}
            disabled={bulkBusy}
            className="text-sm font-medium text-sky-700 hover:underline disabled:opacity-50"
          >
            Enable
          </button>
          <button
            onClick={() => bulkSetActive(false)}
            disabled={bulkBusy}
            className="text-sm font-medium text-status-danger-text hover:underline disabled:opacity-50"
          >
            Disable
          </button>
          <button
            onClick={() => {
              setError(null)
              setBulkDeleteConfirm(true)
            }}
            disabled={bulkBusy}
            className="text-sm font-medium text-status-danger-text hover:underline disabled:opacity-50"
          >
            Delete
          </button>
          {bulkBusy && <span className="text-xs text-gray-500">Working...</span>}
          <button onClick={() => setRowSelection({})} className="ml-auto text-sm font-medium text-gray-500 hover:underline">
            Clear selection
          </button>
        </div>
      )}

      <DataTable
        columns={columns}
        data={rows}
        getRowId={(u) => u.id}
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        isLoading={isLoading}
        emptyMessage={
          people.length > 0
            ? 'No users match these filters.'
            : isAdmin
              ? 'No users yet.'
              : 'No one is assigned to you yet. New logins you add will appear here once they are on your team.'
        }
        rowClassName={(u) => (!u.is_active ? 'opacity-60' : '')}
      />

      {bulkImporting && (
        <BulkImportUsersModal
          existingEmails={new Set((data ?? []).map((u) => u.email.toLowerCase()))}
          canSetRole={isAdmin}
          onClose={() => setBulkImporting(false)}
        />
      )}

      {adding && (
        <Modal title="Add Login" onClose={() => setAdding(false)}>
          <form onSubmit={handleCreate} className="flex flex-col gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Name</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Temporary Password</label>
              <input
                type="text"
                required
                minLength={8}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </div>
            {isAdmin && (
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Role</label>
                <Select
                  fullWidth
                  value={form.role}
                  onChange={(value) => setForm({ ...form, role: value as User['role'] })}
                  options={ROLE_OPTIONS}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </div>
            )}
            {error && <div className="text-sm text-status-danger-text">{error}</div>}
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAdding(false)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
              >
                {createMutation.isPending ? 'Saving...' : 'Add Login'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {resetTarget && (
        <Modal title={`Reset Password — ${resetTarget.name}`} onClose={() => setResetTarget(null)}>
          <form onSubmit={handleReset} className="flex flex-col gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">New Password</label>
              <input
                type="text"
                required
                minLength={8}
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </div>
            {error && <div className="text-sm text-status-danger-text">{error}</div>}
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setResetTarget(null)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={resetMutation.isPending}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
              >
                {resetMutation.isPending ? 'Saving...' : 'Set Password'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {deleteTarget && (
        <Modal title={`Delete ${deleteTarget.name}'s login?`} onClose={() => setDeleteTarget(null)}>
          <form onSubmit={handleDelete} className="flex flex-col gap-3">
            <p className="text-sm text-gray-600">
              This permanently removes <span className="font-medium text-gray-900">{deleteTarget.name}</span>'s ({deleteTarget.email}) login. This
              cannot be undone.
            </p>
            {error && <div className="text-sm text-status-danger-text">{error}</div>}
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={deleteMutation.isPending}
                className="rounded-lg bg-status-danger-text px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete Login'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {bulkDeleteConfirm && (
        <Modal title={`Delete ${selectedIds.length} login${selectedIds.length === 1 ? '' : 's'}?`} onClose={() => setBulkDeleteConfirm(false)}>
          <form onSubmit={handleBulkDelete} className="flex flex-col gap-3">
            <p className="text-sm text-gray-600">
              This permanently removes <span className="font-medium text-gray-900">{selectedIds.length}</span> selected login
              {selectedIds.length === 1 ? '' : 's'}. This cannot be undone.
            </p>
            {error && <div className="text-sm text-status-danger-text">{error}</div>}
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setBulkDeleteConfirm(false)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={bulkMutation.isPending}
                className="rounded-lg bg-status-danger-text px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {bulkMutation.isPending ? 'Deleting...' : `Delete ${selectedIds.length} Login${selectedIds.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
