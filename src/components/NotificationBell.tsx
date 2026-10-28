import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { supabase } from '../lib/api'
import { useAuth } from '../lib/auth'
import { ALERT_NOTIFICATION_SOUND, loopSound } from '../lib/sound'
import { Avatar } from './Avatar'
import { RequestAlarm } from './RequestAlarm'
import { contributorPath } from '../lib/urlRef'
import { fetchPendingRequestsForAlarm, type PendingRequestAlarmRow } from '../lib/taskRequests'

const MANAGER_ROLES = ['admin', 'lead']
const MAX_SUBMISSION_ALERTS = 20
const PANEL_WIDTH = 320
const EDGE_GAP = 8
// Above Modal's z-50, so a panel opened inside a modal isn't covered by it.
const PANEL_Z_INDEX = 60
// How often the tab title flips while a new request is ringing.
const TITLE_FLASH_MS = 1000
// How often the alarm checks for pending requests, in case a live event was missed.
const PENDING_POLL_MS = 30_000
// One shared empty list, so having no pending requests yet doesn't hand the effects below a new
// array every render (which re-marked them seen on every render on the Requests page, forever).
const NO_PENDING: PendingRequestAlarmRow[] = []

// The pending requests a lead has already looked at (opened the bell, the Requests page or the
// alarm's buttons), kept in this browser so a reload doesn't ring for them again.
function seenKey(userId: string) {
  return `request-alarm-seen:${userId}`
}

function readSeen(userId: string | undefined): Set<number> {
  if (!userId) return new Set()
  try {
    return new Set(JSON.parse(localStorage.getItem(seenKey(userId)) ?? '[]') as number[])
  } catch {
    return new Set()
  }
}

function writeSeen(userId: string, ids: number[]) {
  try {
    localStorage.setItem(seenKey(userId), JSON.stringify(ids))
  } catch {
    // Not remembering only means it rings again after a reload.
  }
}

interface SubmissionAlert {
  id: string
  name: string
  email: string
  project: string | null
}

interface TaskSubmissionRow {
  id: number
  cb_email: string
  status: string
  project_id: number | null
}

interface RequestAlert {
  id: string
  name: string
  email: string
  type: 'extension' | 'reclaim' | 'bad_video'
}

interface TaskRequestRow {
  id: number
  requested_by: string
  type: 'extension' | 'reclaim' | 'bad_video'
  status: string
}

// A fresh topic each time a subscription starts. supabase.channel() hands back an existing channel
// with the same name, and removeChannel() only drops one once it has finished leaving, so
// resubscribing straight after a cleanup used to get the old, closing channel back: no error, just
// no more events. That's how a lead missed the alarm for a new request.
function liveChannelName(name: string): string {
  return `${name}-${crypto.randomUUID()}`
}

export function NotificationBell() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top?: number; bottom?: number; right: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const isManager = Boolean(user && MANAGER_ROLES.includes(user.role))
  const { pathname } = useLocation()
  // Leads only (admins keep the quiet bell): rings, on whatever page they're on, while any pending
  // request they haven't looked at yet is waiting, until they look by opening the bell, the
  // Requests page or the alarm's own buttons. It goes by the pending requests themselves (checked
  // every half minute, and at once on a live event) rather than by live events alone, so a missed
  // event, a sleeping tab or a request sent before they signed in still sets it off.
  const isLead = user?.role === 'lead'
  const onRequestsPage = pathname.startsWith('/requests')
  const { data: pendingRequests = NO_PENDING, refetch: refetchPending } = useQuery({
    queryKey: ['task-requests', 'pending-alarm', user?.id],
    queryFn: () => fetchPendingRequestsForAlarm(user!.id),
    enabled: isLead,
    refetchInterval: PENDING_POLL_MS,
    refetchIntervalInBackground: true,
  })
  const [seen, setSeen] = useState<Set<number>>(() => readSeen(user?.id))
  const unseenRequests = pendingRequests.filter((r) => !seen.has(r.id))
  const ringing = isLead && unseenRequests.length > 0 && !open && !onRequestsPage

  // Everything pending now counts as looked at; only requests that come in after this ring again.
  function markSeen() {
    if (!user) return
    const ids = pendingRequests.map((r) => r.id)
    setSeen(new Set(ids))
    writeSeen(user.id, ids)
  }

  // Fixed-position panel, measured against the button: never clipped by an ancestor's
  // overflow-hidden, and flips upward if there isn't room below.
  useLayoutEffect(() => {
    const button = buttonRef.current
    if (!open || !button) return
    const rect = button.getBoundingClientRect()
    const below = window.innerHeight - rect.bottom - EDGE_GAP
    const openUp = below < 300 && rect.top > below
    setPos({
      ...(openUp ? { bottom: window.innerHeight - rect.top + 8 } : { top: rect.bottom + 8 }),
      right: window.innerWidth - rect.right,
    })
  }, [open])

  const [submissionAlerts, setSubmissionAlerts] = useState<SubmissionAlert[]>([])
  const [requestAlerts, setRequestAlerts] = useState<RequestAlert[]>([])
  const [profileNames, setProfileNames] = useState<Map<string, string>>()
  const [profilesById, setProfilesById] = useState<Map<string, { name: string; email: string }>>()
  const [projectNames, setProjectNames] = useState<Map<number, string>>()
  // Read through refs so the live subscriptions below don't restart when these load: restarting one
  // left it dead (see liveChannelName).
  const lookups = useRef({ profileNames, profilesById, projectNames, refetchPending })
  useEffect(() => {
    lookups.current = { profileNames, profilesById, projectNames, refetchPending }
  })

  useEffect(() => {
    if (!isManager) return
    supabase
      .from('profiles')
      .select('id, email, name')
      .then(({ data }) => {
        const rows = data ?? []
        setProfileNames(new Map(rows.map((p) => [p.email.toLowerCase(), p.name as string])))
        setProfilesById(new Map(rows.map((p) => [p.id as string, { name: p.name as string, email: p.email as string }])))
      })
    supabase
      .from('projects')
      .select('id, name')
      .then(({ data }) => setProjectNames(new Map((data ?? []).map((p) => [p.id as number, p.name as string]))))
  }, [isManager])

  useEffect(() => {
    if (!isManager) return

    function addSubmissionAlert(row: TaskSubmissionRow) {
      const { profileNames, projectNames } = lookups.current
      const name = profileNames?.get(row.cb_email.toLowerCase()) ?? row.cb_email
      const project = row.project_id != null ? (projectNames?.get(row.project_id) ?? null) : null
      const id = `${row.id}-${Date.now()}`
      setSubmissionAlerts((prev) => [{ id, name, email: row.cb_email, project }, ...prev].slice(0, MAX_SUBMISSION_ALERTS))
    }

    const channel = supabase
      .channel(liveChannelName('task-submissions-live'))
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'task_submissions' },
        (payload) => {
          const row = payload.new as TaskSubmissionRow
          if (row.status === 'submitted') addSubmissionAlert(row)
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'task_submissions' },
        (payload) => {
          const row = payload.new as TaskSubmissionRow
          const old = payload.old as Partial<TaskSubmissionRow>
          if (row.status === 'submitted' && old.status !== 'submitted') addSubmissionAlert(row)
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [isManager])

  useEffect(() => {
    if (!isManager) return

    function addRequestAlert(row: TaskRequestRow) {
      const { profilesById, refetchPending } = lookups.current
      const profile = profilesById?.get(row.requested_by)
      const id = `${row.id}-${Date.now()}`
      setRequestAlerts((prev) =>
        [{ id, name: profile?.name ?? 'Someone', email: profile?.email ?? '', type: row.type }, ...prev].slice(0, MAX_SUBMISSION_ALERTS),
      )
      // Ring now rather than at the next check.
      refetchPending()
    }

    const channel = supabase
      .channel(liveChannelName('task-requests-live'))
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'task_requests' },
        (payload) => {
          const row = payload.new as TaskRequestRow
          // Not your own: a lead flagging a bad video shouldn't set off their own alarm.
          if (row.status === 'pending' && row.requested_by !== user?.id) addRequestAlert(row)
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [isManager, user?.id])

  // Deliberately hard to ignore: the alert sound plays on repeat, the bell shakes and the tab title
  // flashes, and none of it stops until the request has been seen.
  const seenNow = open || onRequestsPage
  useEffect(() => {
    if (seenNow) markSeen()
    // Rerun when the pending requests change, so ones arriving while the lead is looking count as seen.
  }, [seenNow, pendingRequests])

  useEffect(() => {
    if (!ringing) return
    const stopSound = loopSound(ALERT_NOTIFICATION_SOUND)
    const title = document.title
    let flipped = false
    const flash = setInterval(() => {
      flipped = !flipped
      document.title = flipped ? '🔔 NEW REQUEST 🔔' : title
    }, TITLE_FLASH_MS)
    return () => {
      stopSound()
      clearInterval(flash)
      document.title = title
    }
  }, [ringing])

  function dismissSubmissionAlert(id: string) {
    setSubmissionAlerts((prev) => prev.filter((a) => a.id !== id))
  }

  function dismissRequestAlert(id: string) {
    setRequestAlerts((prev) => prev.filter((a) => a.id !== id))
  }

  const count = isManager ? submissionAlerts.length + requestAlerts.length : 0

  function close() {
    setOpen(false)
    setPos(null)
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setOpen((v) => !v)}
        className={`relative rounded-lg border p-2 ${
          ringing
            ? 'border-status-danger-text bg-status-danger-bg text-status-danger-text'
            : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'
        }`}
        aria-label={ringing ? 'Notifications: new request' : 'Notifications'}
      >
        {ringing && <span className="call-sonar absolute inset-0 rounded-lg border-2 border-status-danger-text" aria-hidden />}
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={`h-5 w-5 ${ringing ? 'call-ring-shake' : ''}`}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5m6 0v1a3 3 0 1 1-6 0v-1m6 0H9" />
        </svg>
        {count > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-status-danger-text px-1 text-[10px] font-bold text-white">
            {count}
          </span>
        )}
      </button>

      {ringing && (
        <RequestAlarm
          requests={unseenRequests.map((r) => ({
            id: String(r.id),
            name: r.requester?.name ?? 'Someone',
            email: r.requester?.email ?? '',
            type: r.type,
          }))}
          onDismiss={markSeen}
        />
      )}

      {open &&
        pos &&
        createPortal(
          <>
            <div className="fixed inset-0" style={{ zIndex: PANEL_Z_INDEX }} onClick={close} />
            <div
              style={{ position: 'fixed', zIndex: PANEL_Z_INDEX + 1, width: PANEL_WIDTH, maxWidth: 'calc(100vw - 24px)', ...pos }}
              className="rounded-xl border border-gray-200 bg-white p-2 shadow-lg"
            >
              <div className="flex items-center justify-between px-2 py-1.5">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Notifications</span>
                {count > 0 && (
                  <button
                    onClick={() => {
                      setSubmissionAlerts([])
                      setRequestAlerts([])
                    }}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-700 hover:underline"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                    Clear all
                  </button>
                )}
              </div>
              <div className="flex max-h-96 flex-col gap-1 overflow-y-auto">
                {(!isManager || count === 0) && <div className="px-2 py-3 text-sm text-gray-400">Nothing to show.</div>}
                {requestAlerts.map((alert) => (
                  <div key={alert.id} className="group flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-gray-50">
                    <Link
                      to="/requests"
                      onClick={close}
                      className="flex min-w-0 flex-1 items-center gap-2 text-sm"
                    >
                      <Avatar name={alert.name || alert.email} size={28} />
                      <div className="min-w-0">
                        <div className="truncate font-medium text-gray-900">
                          {alert.name}{' '}
                          {alert.type === 'extension'
                            ? 'requested an extension'
                            : alert.type === 'reclaim'
                              ? 'requested a reclaim'
                              : 'flagged a bad video'}
                        </div>
                      </div>
                    </Link>
                    <button
                      onClick={() => dismissRequestAlert(alert.id)}
                      className="shrink-0 rounded p-1 text-gray-300 hover:bg-gray-200 hover:text-gray-600"
                      aria-label="Dismiss"
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                ))}
                {submissionAlerts.map((alert) => (
                  <div key={alert.id} className="group flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-gray-50">
                    <Link
                      to={contributorPath(alert.email)}
                      onClick={close}
                      className="flex min-w-0 flex-1 items-center gap-2 text-sm"
                    >
                      <Avatar name={alert.name || alert.email} size={28} />
                      <div className="min-w-0">
                        <div className="truncate font-medium text-gray-900">{alert.name} submitted a task</div>
                        {alert.project && <div className="truncate text-xs text-gray-400">{alert.project}</div>}
                      </div>
                    </Link>
                    <button
                      onClick={() => dismissSubmissionAlert(alert.id)}
                      className="shrink-0 rounded p-1 text-gray-300 hover:bg-gray-200 hover:text-gray-600"
                      aria-label="Dismiss"
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </>,
          document.body,
        )}
    </div>
  )
}
