import { useState, type FormEvent } from 'react'
import { LogOut, Save } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { errorMessage } from '../lib/api'
import { useAuth } from '../lib/auth'
import { setOwnRemotasksId } from '../lib/profile'
import { normalizeRemotasksId, remotasksIdError } from '../lib/remotasks'
import { RemotasksIdField } from './RemotasksIdField'

/**
 * Covers the app until the signed-in user has saved a valid Remotask ID: extension and reclaim
 * requests are filed with Scale under it, so a missing or mistyped one stalls them. There's no
 * close button on purpose; signing out is the only other way out.
 */
export function RemotasksIdGate() {
  const { user, refreshUser, logout } = useAuth()
  const queryClient = useQueryClient()
  // Starts from what's saved, so someone with a mistyped ID sees it and can fix it.
  const [value, setValue] = useState(() => user?.remotasks_id ?? '')
  const [attempted, setAttempted] = useState(Boolean(user?.remotasks_id))
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setAttempted(true)
    if (remotasksIdError(value)) return
    setError(null)
    setSubmitting(true)
    try {
      await setOwnRemotasksId(normalizeRemotasksId(value)!)
      await refreshUser()
      queryClient.invalidateQueries({ queryKey: ['contributor'] })
      queryClient.invalidateQueries({ queryKey: ['users'] })
    } catch (err) {
      setError(errorMessage(err, 'Could not save your Remotask ID.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-black/40" role="dialog" aria-modal="true" aria-labelledby="remotasks-id-gate-title">
      <div className="flex min-h-full items-center justify-center px-3 py-6 sm:px-4">
        <form onSubmit={handleSubmit} className="flex w-full max-w-md flex-col gap-4 rounded-2xl bg-white p-4 shadow-xl sm:p-6">
          <div>
            <h2 id="remotasks-id-gate-title" className="text-lg font-semibold text-gray-900">
              {user?.remotasks_id ? 'Check your Remotask ID' : 'Add your Remotask ID'}
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              {user?.remotasks_id
                ? "The Remotask ID on your profile isn't a valid one. Fix it to keep using the tracker."
                : 'Your lead files extension and reclaim requests with Scale under your Remotask ID. Add it to keep using the tracker.'}
            </p>
          </div>
          <RemotasksIdField value={value} onChange={setValue} showError={attempted} autoFocus />
          {error && <div className="text-sm text-status-danger-text">{error}</div>}
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
          >
            <Save className="h-4 w-4" aria-hidden />
            {submitting ? 'Saving...' : 'Save and continue'}
          </button>
          <button type="button" onClick={() => logout()} className="inline-flex items-center justify-center gap-1.5 text-sm text-sky-700 hover:underline">
            <LogOut className="h-4 w-4" aria-hidden />
            Sign out
          </button>
        </form>
      </div>
    </div>
  )
}
