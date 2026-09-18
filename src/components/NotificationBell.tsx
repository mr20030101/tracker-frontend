import { useEffect, useState } from 'react'
import { supabase } from '../lib/api'
import { useAuth } from '../lib/auth'

const MANAGER_ROLES = ['admin', 'lead']
const MAX_SUBMISSION_ALERTS = 20

interface SubmissionAlert {
  id: string
  name: string
  project: string | null
}

interface TaskSubmissionRow {
  id: number
  cb_email: string
  status: string
  project_id: number | null
}

export function NotificationBell() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const isManager = Boolean(user && MANAGER_ROLES.includes(user.role))

  const [submissionAlerts, setSubmissionAlerts] = useState<SubmissionAlert[]>([])
  const [profileNames, setProfileNames] = useState<Map<string, string>>()
  const [projectNames, setProjectNames] = useState<Map<number, string>>()

  useEffect(() => {
    if (!isManager) return
    supabase
      .from('profiles')
      .select('email, name')
      .then(({ data }) => setProfileNames(new Map((data ?? []).map((p) => [p.email.toLowerCase(), p.name as string]))))
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
      setSubmissionAlerts((prev) => [{ id, name, project }, ...prev].slice(0, MAX_SUBMISSION_ALERTS))
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

  function dismissSubmissionAlert(id: string) {
    setSubmissionAlerts((prev) => prev.filter((a) => a.id !== id))
  }

  const count = isManager ? submissionAlerts.length : 0

  return (
    <div className="relative">
      <button
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

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-2 w-80 rounded-xl border border-gray-200 bg-white p-2 shadow-lg">
            <div className="flex items-center justify-between px-2 py-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Notifications</span>
              {count > 0 && (
                <button onClick={() => setSubmissionAlerts([])} className="text-xs font-medium text-sky-700 hover:underline">
                  Clear all
                </button>
              )}
            </div>
            <div className="flex max-h-96 flex-col gap-1 overflow-y-auto">
              {(!isManager || submissionAlerts.length === 0) && (
                <div className="px-2 py-3 text-sm text-gray-400">Nothing to show.</div>
              )}
              {submissionAlerts.map((alert) => (
                <div key={alert.id} className="group flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-gray-50">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-status-success-text" />
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="truncate font-medium text-gray-900">{alert.name} submitted a task</div>
                    {alert.project && <div className="truncate text-xs text-gray-400">{alert.project}</div>}
                  </div>
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
        </>
      )}
    </div>
  )
}
