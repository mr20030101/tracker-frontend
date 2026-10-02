import { api } from './api'

// Offline task logging: a new task submitted while the connection is down is saved on this device
// and sent when it's back (OfflineQueueBanner runs the sending). Only new submissions are queued;
// editing one, or creating a project, still needs a connection.
//
// Kept per user, so someone else signing in on the same computer never sends another person's
// tasks. localStorage can be unavailable (private windows, blocked storage); then nothing is
// queued and the form reports the error as it always did.

export interface QueuedSubmission {
  id: string
  payload: Record<string, unknown>
  queuedAt: string
  // Why the last send was refused by the server (e.g. a duplicate task ID). It stays queued, for
  // the person to fix by hand or discard; a lost connection is not an error and just waits.
  lastError: string | null
}

const CHANGED = 'offline-queue-changed'

const keyFor = (userId: string) => `tracker.offline-submissions.${userId}`

export function readQueue(userId: string): QueuedSubmission[] {
  try {
    const raw = localStorage.getItem(keyFor(userId))
    return raw ? (JSON.parse(raw) as QueuedSubmission[]) : []
  } catch {
    return []
  }
}

function writeQueue(userId: string, queue: QueuedSubmission[]) {
  try {
    if (queue.length === 0) localStorage.removeItem(keyFor(userId))
    else localStorage.setItem(keyFor(userId), JSON.stringify(queue))
  } finally {
    window.dispatchEvent(new Event(CHANGED))
  }
}

/** Calls `listener` whenever this tab (or another tab) changes the queue. */
export function onQueueChange(listener: () => void): () => void {
  window.addEventListener(CHANGED, listener)
  window.addEventListener('storage', listener)
  return () => {
    window.removeEventListener(CHANGED, listener)
    window.removeEventListener('storage', listener)
  }
}

export function queueSubmission(userId: string, payload: Record<string, unknown>): void {
  const entry: QueuedSubmission = { id: crypto.randomUUID(), payload, queuedAt: new Date().toISOString(), lastError: null }
  // Write first and read back, so a storage failure surfaces here rather than losing the task quietly.
  localStorage.setItem(keyFor(userId), JSON.stringify([...readQueue(userId), entry]))
  window.dispatchEvent(new Event(CHANGED))
}

export function discardQueued(userId: string, id: string): void {
  writeQueue(userId, readQueue(userId).filter((entry) => entry.id !== id))
}

/**
 * Whether an error means "couldn't reach the server" (so the task should wait) rather than "the
 * server said no" (so it shouldn't). Browsers word a failed fetch differently, so it checks both
 * the online flag and the usual messages.
 */
export function isNetworkError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  const message = error instanceof Error ? error.message : String(error ?? '')
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(message)
}

let sending: Promise<number> | null = null

/**
 * Sends every queued submission, oldest first. Stops at the first lost connection (the rest wait
 * for the next try); a refusal is recorded on that entry and the rest carry on. Returns how many
 * were sent. Concurrent calls share one run, so nothing is sent twice.
 */
export function sendQueued(userId: string): Promise<number> {
  sending ??= (async () => {
    let sent = 0
    try {
      for (const entry of readQueue(userId)) {
        try {
          await api.post('/task-submissions', entry.payload)
          discardQueued(userId, entry.id)
          sent += 1
        } catch (error) {
          if (isNetworkError(error)) break
          const reason = error instanceof Error ? error.message : 'Could not send this task.'
          writeQueue(
            userId,
            readQueue(userId).map((item) => (item.id === entry.id ? { ...item, lastError: reason } : item)),
          )
        }
      }
    } finally {
      sending = null
    }
    return sent
  })()
  return sending
}
