import { useState, type FormEvent } from 'react'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/api'
import { clearMustChangePassword } from '../lib/profile'
import { Logo } from '../components/Logo'

export function ForcePasswordChange() {
  const { refreshUser, logout } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (password.length < 8) {
      setError('New password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('New password and confirmation do not match.')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError
      await clearMustChangePassword()
      await refreshUser()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update your password.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="mb-6">
          <Logo />
        </div>
        <h1 className="mb-1 text-base font-semibold text-gray-900">Set a new password</h1>
        <p className="mb-5 text-sm text-gray-500">
          Your login was just created or reset. Choose a new password before continuing.
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">New password</label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Confirm new password</label>
            <input
              type="password"
              required
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
          {error && <div className="text-sm text-status-danger-text">{error}</div>}
          <button
            type="submit"
            disabled={submitting}
            className="mt-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
          >
            {submitting ? 'Updating...' : 'Set password and continue'}
          </button>
          <button type="button" onClick={() => logout()} className="text-sm text-sky-700 hover:underline">
            Sign out
          </button>
        </form>
      </div>
    </div>
  )
}
