// The device's clock can be wrong (a phone set by hand, a laptop that drifted), but attendance is
// checked against the server's clock (file_attendance()). So the app reads the time from the server's
// Date header and keeps how far off the device is, and anything time-sensitive uses serverNow().

// The Date header only has whole seconds, so smaller differences are noise and are ignored.
const MIN_SKEW_MS = 2000
const RESYNC_MS = 10 * 60_000

let offsetMs = 0
let syncing: Promise<void> | null = null
let started = false

/** The current time by the server's clock, in ms. */
export function serverNow(): number {
  return Date.now() + offsetMs
}

/**
 * How far the server's clock is ahead of the device's, from a Date header (whole seconds) and the
 * device times just before and after the request.
 */
export function clockOffset(dateHeader: string, sentAt: number, receivedAt: number): number | null {
  const serverMs = Date.parse(dateHeader)
  if (Number.isNaN(serverMs)) return null
  const offset = serverMs + 500 - (sentAt + receivedAt) / 2
  return Math.abs(offset) < MIN_SKEW_MS ? 0 : Math.round(offset)
}

export function syncServerClock(): Promise<void> {
  syncing ??= (async () => {
    try {
      const sentAt = Date.now()
      const res = await fetch(`/?clock=${sentAt}`, { method: 'HEAD', cache: 'no-store' })
      const receivedAt = Date.now()
      const date = res.headers.get('date')
      // A slow answer can't place the server's time closely enough to correct by.
      if (!date || receivedAt - sentAt > 5000) return
      const offset = clockOffset(date, sentAt, receivedAt)
      if (offset !== null) offsetMs = offset
    } catch {
      // Offline: keep the last offset.
    } finally {
      syncing = null
    }
  })()
  return syncing
}

/** Syncs now, whenever the app comes back to the foreground, and every 10 minutes. */
export function startServerClock(): void {
  if (started) return
  started = true
  void syncServerClock()
  setInterval(() => void syncServerClock(), RESYNC_MS)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncServerClock()
  })
}
