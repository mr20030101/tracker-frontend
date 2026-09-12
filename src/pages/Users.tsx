import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import type { User } from '../types'
import { Modal } from '../components/Modal'
import { Avatar } from '../components/Avatar'

const ROLES: User['role'][] = ['contributor', 'lead', 'admin']
const DEFAULT_PASSWORD = 'password'

const emptyForm = { name: '', email: '', password: DEFAULT_PASSWORD, role: 'contributor' as User['role'], shift: '' }

export function Users() {
  const queryClient = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [resetTarget, setResetTarget] = useState<User | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [resetPassword, setResetPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [searchParams] = useSearchParams()
  const search = (searchParams.get('search') ?? '').toLowerCase()

  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => (await api.get<User[]>('/users')).data,
  })

  const createMutation = useMutation({
    mutationFn: async () => api.post('/users', form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setAdding(false)
      setForm(emptyForm)
      setError(null)
    },
    onError: () => setError('Could not create this login. The email may already be in use.'),
  })

  const roleMutation = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: User['role'] }) => api.patch(`/users/${id}`, { role }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  })

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch(`/users/${id}`, { is_active: isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  })

  const resetMutation = useMutation({
    mutationFn: async () => api.patch(`/users/${resetTarget!.id}`, { password: resetPassword }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setResetTarget(null)
      setResetPassword('')
    },
    onError: (mutationError: Error) => setError(mutationError.message || 'Could not reset this password.'),
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

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="text-sm text-gray-500">Manage CB logins, roles, and passwords.</p>
          <p className="mt-1 text-xs text-gray-400">New accounts default to: {DEFAULT_PASSWORD}</p>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
        >
          + Add Login
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
            <tr>
              <th className="px-5 py-3">Name</th>
              <th className="px-5 py-3">Role</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && (
              <tr>
                <td colSpan={4} className="px-5 py-6 text-center text-gray-400">
                  Loading...
                </td>
              </tr>
            )}
            {data?.filter((u) => !search || u.name.toLowerCase().includes(search) || u.email.toLowerCase().includes(search)).map((u) => (
              <tr key={u.id} className={`hover:bg-gray-50 ${!u.is_active ? 'opacity-60' : ''}`}>
                <td className="px-5 py-3">
                  <Link
                    to={`/contributors/${encodeURIComponent(u.email)}`}
                    className="flex items-center gap-3 hover:underline"
                  >
                    <Avatar name={u.name} size={28} />
                    <div>
                      <div className="font-medium text-gray-900">{u.name}</div>
                      <div className="text-xs text-gray-400">{u.email}</div>
                    </div>
                  </Link>
                </td>
                <td className="px-5 py-3">
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
                </td>
                <td className="px-5 py-3">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${u.is_active
                      ? 'bg-status-success-bg text-status-success-text'
                      : 'bg-status-danger-bg text-status-danger-text'
                      }`}
                  >
                    {u.is_active ? 'Active' : 'Disabled'}
                  </span>
                </td>
                <td className="px-5 py-3 text-right">
                  <div className="flex justify-end gap-3">
                    <button
                      onClick={() => toggleActiveMutation.mutate({ id: u.id, isActive: !u.is_active })}
                      className={`text-xs font-medium hover:underline ${u.is_active ? 'text-status-danger-text' : 'text-sky-700'
                        }`}
                    >
                      {u.is_active ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      onClick={() => setResetTarget(u)}
                      className="text-xs font-medium text-sky-700 hover:underline"
                    >
                      Reset Password
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
    </div>
  )
}
