import { useState } from 'react'
import { UserRoundCheck } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { loginAsReturn, returnToOwnAccount } from '../lib/loginAs'

// Shown on every page while an admin is logged in as someone else, with the way back.
export function LoginAsBar() {
  const { user } = useAuth()
  const [busy, setBusy] = useState(false)
  const back = loginAsReturn()
  if (!user || back?.target_id !== user.id) return null

  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto flex w-fit max-w-full items-center gap-3 rounded-full bg-ink py-1.5 pl-4 pr-1.5 text-sm text-ink-foreground shadow-card"
    >
      <UserRoundCheck className="h-4 w-4 shrink-0" aria-hidden />
      <span className="truncate">
        Logged in as <strong className="font-semibold">{user.name}</strong>
      </span>
      <button
        type="button"
        aria-busy={busy}
        onClick={() => {
          if (busy) return
          setBusy(true)
          void returnToOwnAccount()
        }}
        className="flex min-h-9 shrink-0 items-center rounded-full bg-accent px-4 font-semibold text-accent-foreground transition-colors duration-100 hover:bg-accent-hover"
      >
        {busy ? 'Returning…' : 'Return to my account'}
      </button>
    </div>
  )
}
