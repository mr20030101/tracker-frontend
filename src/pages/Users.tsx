import { useMemo, useState, type FormEvent } from 'react'
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
import { BulkImportUsersModal } from '../components/BulkImportUsersModal'

const ROLES: User['role'][] = ['contributor', 'lead', 'admin']
const DEFAULT_PASSWORD = 'password'

type StatusFilter = '' | 'active' | 'disabled'

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
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [searchParams] = useSearchParams()
  const [search, setSearch] = useState(searchParams.get('search') ?? '')
  const [roleFilter, setRoleFilter] = useState<User['role'] | ''>('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('')
  const [leadFilter, setLeadFilter] = useState<'' | 'none'>('')
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const normalizedSearch = search.trim().toLowerCase()

  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => (await api.get<User[]>('/users')).data,
    refetchInterval: 30_000,
  })

  const createMutation = useMutation({
    mutationFn: async () => api.post('/users', form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setAdding(false)
      setForm(emptyForm)
      setError(null)
    },
    onError: (mutationError: Error) => setError(mutationError.message || 'Could not create this login.'),
  })

  const roleMutation = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: User['role'] }) => api.patch(`/users/${id}`, { role }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  })

  const leadMutation = useMutation({
    mutationFn: async ({ id, leadId }: { id: string; leadId: string | null }) =>
      api.patch(`/users/${id}`, { lead_id: leadId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  })

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch(`/users/${id}`, { is_active: isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: async (u: User) => api.delete(`/users/${u.id}`),
    onSuccess: (_result, u) => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setNotice(`${u.name}'s login was deleted.`)
      setError(null)
      setDeleteTarget(null)
    },
    onError: (mutationError: Error) => setError(mutationError.message || 'Could not delete this login.'),
  })

  const resetMutation = useMutation({
    mutationFn: async () => api.patch(`/users/${resetTarget!.id}`, { password: resetPassword, email: resetTarget!.email }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setResetTarget(null)
      setResetPassword('')
    },
    onError: (mutationError: Error) => setError(mutationError.message || 'Could not reset this password.'),
  })

  const bulkRoleMutation = useMutation({
    mutationFn: async ({ ids, role }: { ids: string[]; role: User['role'] }) =>
      Promise.all(ids.map((id) => api.patch(`/users/${id}`, { role }))),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setRowSelection({})
      setError(null)
    },
    onError: (mutationError: Error) => setError(mutationError.message || 'Could not update those logins.'),
  })

  const bulkLeadMutation = useMutation({
    mutationFn: async ({ ids, leadId }: { ids: string[]; leadId: string | null }) =>
      Promise.all(ids.map((id) => api.patch(`/users/${id}`, { lead_id: leadId }))),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setRowSelection({})
      setError(null)
    },
    onError: (mutationError: Error) => setError(mutationError.message || 'Could not update those logins.'),
  })

  const bulkActiveMutation = useMutation({
    mutationFn: async ({ ids, isActive }: { ids: string[]; isActive: boolean }) =>
      Promise.all(ids.map((id) => api.patch(`/users/${id}`, { is_active: isActive }))),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setRowSelection({})
      setError(null)
    },
    onError: (mutationError: Error) => setError(mutationError.message || 'Could not update those logins.'),
  })

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => Promise.all(ids.map((id) => api.delete(`/users/${id}`))),
    onSuccess: (_result, ids) => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setNotice(`${ids.length} login${ids.length === 1 ? '' : 's'} deleted.`)
      setRowSelection({})
      setBulkDeleteConfirm(false)
      setError(null)
    },
    onError: (mutationError: Error) => setError(mutationError.message || 'Could not delete those logins.'),
  })

  function handleCreate(e: FormEvent) {
    e.preventDefault()
    setError(null)
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
    bulkDeleteMutation.mutate(selectedIds)
  }

  const rows = (data ?? [])
    .filter((u) => u.id !== currentUser?.id)
    .filter((u) => !normalizedSearch || u.name.toLowerCase().includes(normalizedSearch) || u.email.toLowerCase().includes(normalizedSearch))
    .filter((u) => !roleFilter || u.role === roleFilter)
    .filter((u) => !statusFilter || (statusFilter === 'active' ? u.is_active : !u.is_active))
    .filter((u) => !leadFilter || !u.lead_id)

  const selectedIds = Object.keys(rowSelection).filter((id) => rowSelection[id])

  const hasActiveFilters = Boolean(search || roleFilter || statusFilter || leadFilter)

  function clearFilters() {
    setSearch('')
    setRoleFilter('')
    setStatusFilter('')
    setLeadFilter('')
  }

  const columns = useMemo<ColumnDef<User, any>[]>(
    () => [
      {
        id: 'select',
        header: ({ table }) => (
          <input
            type="checkbox"
            checked={table.getIsAllRowsSelected()}
            onChange={table.getToggleAllRowsSelectedHandler()}
            className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent"
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
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
          return (
            <Link to={`/contributors/${encodeURIComponent(u.email)}`} className="flex items-center gap-3 hover:underline">
              <Avatar name={u.name} photoUrl={u.avatar_url} size={28} />
              <div>
                <div className="font-medium text-gray-900">{u.name}</div>
                <div className="text-xs text-gray-400">{u.email}</div>
              </div>
            </Link>
          )
        },
      },
      {
        id: 'role',
        accessorFn: (u) => u.role,
        header: 'Role',
        cell: ({ row }) => {
          const u = row.original
          return isAdmin ? (
            <select
              value={u.role}
              onChange={(e) => roleMutation.mutate({ id: u.id, role: e.target.value as User['role'] })}
              className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs capitalize outline-none focus:border-accent"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-xs capitalize text-gray-600">{u.role}</span>
          )
        },
      },
      {
        id: 'lead',
        header: 'Lead',
        enableSorting: false,
        cell: ({ row }) => {
          const u = row.original
          return isAdmin ? (
            <Combobox
              value={u.lead_id ?? ''}
              onChange={(leadId) => leadMutation.mutate({ id: u.id, leadId: leadId || null })}
              options={
                data
                  ?.filter((lead) => lead.role === 'lead' && lead.id !== u.id)
                  .map((lead) => ({ value: lead.id, label: lead.name })) ?? []
              }
              placeholder="Search leads..."
              className="max-w-40"
            />
          ) : (
            <span className="text-xs text-gray-500">{data?.find((lead) => lead.id === u.lead_id)?.name ?? '—'}</span>
          )
        },
      },
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
                    onClick: () => setResetTarget(u),
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
    [isAdmin, data, currentUser, roleMutation, leadMutation, toggleActiveMutation, deleteMutation],
  )

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="text-sm text-gray-500">Manage CB logins, roles, and passwords.</p>
          <p className="mt-1 text-xs text-gray-400">New accounts default to: {DEFAULT_PASSWORD}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setBulkImporting(true)}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50"
          >
            Bulk Import
          </button>
          <button
            onClick={() => setAdding(true)}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
          >
            + Add Login
          </button>
        </div>
      </div>
      {notice && <div className="mb-4 text-sm text-status-success-text">{notice}</div>}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="search"
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setRowSelection({})
          }}
          className="w-64 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <select
          value={roleFilter}
          onChange={(e) => {
            setRoleFilter(e.target.value as User['role'] | '')
            setRowSelection({})
          }}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm capitalize outline-none focus:border-accent"
        >
          <option value="">All Roles</option>
          {ROLES.map((r) => (
            <option key={r} value={r} className="capitalize">
              {r}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as StatusFilter)
            setRowSelection({})
          }}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent"
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="disabled">Disabled</option>
        </select>
        <select
          value={leadFilter}
          onChange={(e) => {
            setLeadFilter(e.target.value as '' | 'none')
            setRowSelection({})
          }}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent"
        >
          <option value="">All Leads</option>
          <option value="none">No Lead Assigned</option>
        </select>
        {hasActiveFilters && (
          <button onClick={clearFilters} className="text-sm font-medium text-sky-700 hover:underline">
            Clear filters
          </button>
        )}
      </div>

      {selectedIds.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5">
          <span className="text-sm font-medium text-gray-700">{selectedIds.length} selected</span>
          {isAdmin && (
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) bulkRoleMutation.mutate({ ids: selectedIds, role: e.target.value as User['role'] })
              }}
              className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm capitalize outline-none focus:border-accent"
            >
              <option value="">Set role...</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          )}
          {isAdmin && (
            <select
              value=""
              onChange={(e) => {
                if (e.target.value === '') return
                bulkLeadMutation.mutate({ ids: selectedIds, leadId: e.target.value === '__none__' ? null : e.target.value })
              }}
              className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-accent"
            >
              <option value="">Set lead...</option>
              <option value="__none__">— No lead —</option>
              {data
                ?.filter((lead) => lead.role === 'lead')
                .map((lead) => (
                  <option key={lead.id} value={lead.id}>
                    {lead.name}
                  </option>
                ))}
            </select>
          )}
          <button
            onClick={() => bulkActiveMutation.mutate({ ids: selectedIds, isActive: true })}
            className="text-sm font-medium text-sky-700 hover:underline"
          >
            Enable
          </button>
          <button
            onClick={() => bulkActiveMutation.mutate({ ids: selectedIds, isActive: false })}
            className="text-sm font-medium text-status-danger-text hover:underline"
          >
            Disable
          </button>
          <button onClick={() => setBulkDeleteConfirm(true)} className="text-sm font-medium text-status-danger-text hover:underline">
            Delete
          </button>
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
        emptyMessage="No users match these filters."
        paginate={false}
        rowClassName={(u) => (!u.is_active ? 'opacity-60' : '')}
      />

      {bulkImporting && (
        <BulkImportUsersModal
          existingEmails={new Set((data ?? []).map((u) => u.email.toLowerCase()))}
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
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value as User['role'] })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm capitalize outline-none focus:border-accent"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
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
                disabled={bulkDeleteMutation.isPending}
                className="rounded-lg bg-status-danger-text px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {bulkDeleteMutation.isPending ? 'Deleting...' : `Delete ${selectedIds.length} Login${selectedIds.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
