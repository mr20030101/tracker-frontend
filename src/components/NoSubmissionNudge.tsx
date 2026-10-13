import { useEffect, useId, useState } from 'react'
import { Rocket, X } from 'lucide-react'

// The contributor's "nothing submitted yet this week" nudge: a card that pops up in the middle of the
// screen, with a rocket inside a spinning ring on top, a line of encouragement, and a shortcut to
// submit. It stays until they close it (×, Escape or the backdrop) or go submit.

const ENCOURAGEMENTS = [
  'Every great week starts with one task. Let’s log your first!',
  'You’ve got this. One submission gets the ball rolling.',
  'Small steps add up. Your first task this week is waiting!',
  'The leaderboard is saving you a spot. Go claim it!',
  'Fresh week, fresh start. Show them what you can do!',
]

export function NoSubmissionNudge({ onSubmit, onDismiss }: { onSubmit: () => void; onDismiss: () => void }) {
  const [message] = useState(() => ENCOURAGEMENTS[Math.floor(Math.random() * ENCOURAGEMENTS.length)])
  const titleId = useId()

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onDismiss()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDismiss])

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onDismiss}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="nudge-in relative w-full max-w-sm rounded-2xl border border-gray-200 bg-white px-6 pb-6 pt-12 text-center shadow-xl"
      >
        {/* The badge sits half above the card's top edge. */}
        <div className="absolute -top-9 left-1/2 h-[72px] w-[72px] -translate-x-1/2 rounded-full bg-white text-accent shadow-md">
          <svg viewBox="0 0 72 72" className="absolute inset-0" aria-hidden="true">
            <circle cx="36" cy="36" r="27" className="fill-current opacity-10" />
            <g className="nudge-spin">
              <circle cx="36" cy="36" r="32" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="10 9" />
              <circle cx="36" cy="4" r="3.5" fill="currentColor" />
              <circle cx="64" cy="52" r="2.5" fill="currentColor" opacity="0.7" />
              <circle cx="8" cy="52" r="2" fill="currentColor" opacity="0.5" />
            </g>
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <Rocket className="nudge-bob h-7 w-7" aria-hidden="true" />
          </div>
        </div>

        <button
          type="button"
          onClick={onDismiss}
          className="absolute right-3 top-3 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>

        <p id={titleId} className="text-base font-bold text-gray-900">You have no submissions yet.</p>
        <p className="mt-1 text-sm text-gray-600">{message}</p>
        <button
          type="button"
          onClick={onSubmit}
          className="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
        >
          + Submit a Task
        </button>
      </div>
    </div>
  )
}
