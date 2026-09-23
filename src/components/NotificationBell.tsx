import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/api'
import { useAuth } from '../lib/auth'
import { Avatar } from './Avatar'

const MANAGER_ROLES = ['admin', 'lead']
const MAX_SUBMISSION_ALERTS = 20
const PANEL_WIDTH = 320
const EDGE_GAP = 8
// Above Modal's z-50, so a panel opened inside a modal isn't covered by it.
const PANEL_Z_INDEX = 60

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
  type: 'extension' | 'bad_video'
}

interface TaskRequestRow {
  id: number
  requested_by: string
  type: 'extension' | 'bad_video'
  status: string
}

export function NotificationBell() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top?: number; bottom?: number; right: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const isManager = Boolean(user && MANAGER_ROLES.includes(user.role))

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
      const name = profileNames?.get(row.cb_email.toLowerCase()) ?? row.cb_email
      const project = row.project_id != null ? (projectNames?.get(row.project_id) ?? null) : null
      const id = `${row.id}-${Date.now()}`
      setSubmissionAlerts((prev) => [{ id, name, email: row.cb_email, project }, ...prev].slice(0, MAX_SUBMISSION_ALERTS))
    }

    const channel = supabase
      .channel('task-submissions-live')
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
  }, [isManager, profileNames, projectNames])

  useEffect(() => {
    if (!isManager) return

    function addRequestAlert(row: TaskRequestRow) {
      const profile = profilesById?.get(row.requested_by)
      const id = `${row.id}-${Date.now()}`
      setRequestAlerts((prev) =>
        [{ id, name: profile?.name ?? 'Someone', email: profile?.email ?? '', type: row.type }, ...prev].slice(0, MAX_SUBMISSION_ALERTS),
      )
    }

    const channel = supabase
      .channel('task-requests-live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'task_requests' },
        (payload) => {
          const row = payload.new as TaskRequestRow
          if (row.status === 'pending') addRequestAlert(row)
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [isManager, profilesById])

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
        className="relative rounded-lg border border-gray-200 bg-white p-2 text-gray-500 hover:bg-gray-50"
        aria-label="Notifications"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5m6 0v1a3 3 0 1 1-6 0v-1m6 0H9" />
        </svg>
        {count > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-status-danger-text px-1 text-[10px] font-bold text-white">
            {count}
          </span>
        )}
      </button>

      {open &&
        pos &&
        createPortal(
          <>
            <div className="fixed inset-0" style={{ zIndex: PANEL_Z_INDEX }} onClick={close} />
            <div
              style={{ position: 'fixed', zIndex: PANEL_Z_INDEX + 1, width: PANEL_WIDTH, ...pos }}
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
                    className="text-xs font-medium text-sky-700 hover:underline"
                  >
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
                          {alert.name} {alert.type === 'extension' ? 'requested an extension' : 'flagged a bad video'}
                        </div>
                      </div>
                    </Link>
                    <button
                      onClick={() => dismissRequestAlert(alert.id)}
                      className="shrink-0 rounded p-1 text-gray-300 hover:bg-gray-200 hover:text-gray-600"
                      aria-label="Dismiss"
                    >
                      ×
                    </button>
                  </div>
                ))}
                {submissionAlerts.map((alert) => (
                  <div key={alert.id} className="group flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-gray-50">
                    <Link
                      to={`/contributors/${encodeURIComponent(alert.email)}`}
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
                      ×
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
