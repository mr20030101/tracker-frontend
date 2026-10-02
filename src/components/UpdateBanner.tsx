import { useEffect, useState } from 'react'
import { APP_VERSION, fetchDeployedVersion, isNewerVersion } from '../lib/version'

// "A new version is available": a tab left open across a deploy keeps running the old code
// until it's reloaded, so it says so instead of quietly lagging behind.

// Often enough to notice a deploy the same morning, rarely enough to cost nothing.
const CHECK_EVERY_MS = 5 * 60 * 1000

export function UpdateBanner() {
  const [available, setAvailable] = useState<string | null>(null)
  // Dismissed for this one version only; a later release asks again.
  const [dismissed, setDismissed] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function check() {
      const deployed = await fetchDeployedVersion()
      if (!cancelled && deployed && isNewerVersion(deployed, APP_VERSION)) setAvailable(deployed)
    }

    // Also on coming back to the tab — the likeliest moment someone has been away over a deploy.
    const onVisible = () => document.visibilityState === 'visible' && check()

    check()
    const timer = setInterval(check, CHECK_EVERY_MS)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  if (!available || dismissed === available) return null

  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-4 z-[60] mx-auto flex max-w-md items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 shadow-lg sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2"
    >
      <span className="flex-1">
        A new version of the Tracker is available (<span className="tabular-nums">v{available}</span>).
      </span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="shrink-0 rounded-lg bg-accent px-3 py-1.5 font-semibold text-accent-foreground hover:opacity-90"
      >
        Reload
      </button>
      <button
        type="button"
        onClick={() => setDismissed(available)}
        aria-label="Dismiss"
        className="shrink-0 rounded-lg px-1.5 py-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
      >
        ✕
      </button>
    </div>
  )
}
