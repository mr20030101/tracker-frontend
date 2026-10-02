import { useCallback, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CloudOff, RefreshCw } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { discardQueued, onQueueChange, readQueue, sendQueued, type QueuedSubmission } from '../lib/offlineQueue'

// Tasks saved on this device while offline (lib/offlineQueue), and the sending of them: on load,
// when the connection comes back, every 30 seconds while any are waiting, and on "Send now".

const RETRY_EVERY_MS = 30_000

export function OfflineQueueBanner() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const userId = user?.id ?? null
  const [queue, setQueue] = useState<QueuedSubmission[]>(() => (userId ? readQueue(userId) : []))
  const [online, setOnline] = useState(() => navigator.onLine)
  const [isSending, setIsSending] = useState(false)

  const send = useCallback(async () => {
    if (!userId || readQueue(userId).length === 0) return
    setIsSending(true)
    try {
      const sent = await sendQueued(userId)
      if (sent > 0) {
        // The same refresh a normal submission does, so the new tasks show up everywhere.
        for (const key of ['task-submissions', 'dashboard-summary', 'contributor']) {
          queryClient.invalidateQueries({ queryKey: [key] })
        }
      }
    } finally {
      setIsSending(false)
    }
  }, [userId, queryClient])

  useEffect(() => {
    if (!userId) return
    const refresh = () => setQueue(readQueue(userId))
    refresh()
    return onQueueChange(refresh)
  }, [userId])

  useEffect(() => {
    const goOnline = () => {
      setOnline(true)
      send()
    }
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    send()
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [send])

  // Waiting ones without a refusal are retried on a timer too: the online event isn't reliable
  // on every network (a captive portal, a flaky connection that never fully drops).
  const waiting = queue.filter((entry) => entry.lastError === null).length
  useEffect(() => {
    if (waiting === 0) return
    const timer = setInterval(send, RETRY_EVERY_MS)
    return () => clearInterval(timer)
  }, [waiting, send])

  if (!userId || queue.length === 0) return null
  const refused = queue.filter((entry) => entry.lastError !== null)

  return (
    <div
      role="status"
      className="mb-4 rounded-xl border border-status-warning-text/30 bg-status-warning-bg px-4 py-3 text-sm text-status-warning-text"
    >
      <div className="flex flex-wrap items-center gap-3">
        <CloudOff className="h-4 w-4 shrink-0" />
        <span className="flex-1">
          {waiting > 0 && (
            <>
              <strong>
                {waiting} task{waiting === 1 ? '' : 's'} saved on this device
              </strong>
              {online ? ' — sending...' : ' — they’ll be sent when you’re back online.'}{' '}
            </>
          )}
          {refused.length > 0 && `${refused.length} couldn’t be sent; see below.`}
        </span>
        <button
          type="button"
          onClick={send}
          disabled={isSending || !online}
          className="inline-flex items-center gap-1.5 rounded-lg border border-current px-3 py-1 text-xs font-semibold disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isSending ? 'animate-spin' : ''}`} />
          {isSending ? 'Sending...' : refused.length > 0 && waiting === 0 ? 'Retry' : 'Send now'}
        </button>
      </div>

      {refused.length > 0 && (
        <ul className="mt-3 space-y-2">
          {refused.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/60 px-3 py-2">
              <span>
                <span className="font-semibold">Task {String(entry.payload.task_id ?? '')}</span>
                {entry.payload.date ? ` (${String(entry.payload.date)})` : ''}: {entry.lastError}
              </span>
              <button
                type="button"
                onClick={() => discardQueued(userId, entry.id)}
                className="text-xs font-semibold underline"
              >
                Discard
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
