import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/api'
import { useAuth } from '../lib/auth'
import { toISODate } from '../lib/week'
import { ALERT_NOTIFICATION_SOUND, playSound } from '../lib/sound'
import { Avatar } from './Avatar'

const MANAGER_ROLES = ['admin', 'lead']

interface MissingContributor {
  email: string
  name: string
}

async function fetchManagerAlerts(today: string): Promise<MissingContributor[]> {
  const [{ data: profiles }, { data: submissions }] = await Promise.all([
    supabase.from('profiles').select('email, name').eq('role', 'contributor').eq('is_active', true),
    supabase.from('task_submissions').select('cb_email, status').eq('date', today).eq('status', 'submitted'),
  ])
  const submittedEmails = new Set((submissions ?? []).map((s) => s.cb_email?.toLowerCase()))
  return (profiles ?? [])
    .filter((p) => !submittedEmails.has(p.email.toLowerCase()))
    .map((p) => ({ email: p.email, name: p.name }))
}

async function fetchOwnAlert(email: string, today: string): Promise<boolean> {
  const { data } = await supabase
    .from('task_submissions')
    .select('id')
    .eq('cb_email', email)
    .eq('date', today)
    .eq('status', 'submitted')
    .limit(1)
  return (data ?? []).length === 0
}

function loadDismissed(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

function saveDismissed(key: string, dismissed: Set<string>) {
  try {
    localStorage.setItem(key, JSON.stringify([...dismissed]))
  } catch {
    // ignore storage failures (private mode, quota, etc.)
  }
}

export function NotificationBell() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const isManager = Boolean(user && MANAGER_ROLES.includes(user.role))
  const today = toISODate(new Date())
  const dismissedKey = `notif-dismissed-${today}`

  const [dismissed, setDismissed] = useState<Set<string>>(() => loadDismissed(dismissedKey))

  useEffect(() => {
    setDismissed(loadDismissed(dismissedKey))
  }, [dismissedKey])

  const { data: missingContributors } = useQuery({
    queryKey: ['notifications', 'no-submissions-today', today],
    queryFn: () => fetchManagerAlerts(today),
    enabled: isManager,
    refetchInterval: 60000,
  })

  const { data: ownAlert } = useQuery({
    queryKey: ['notifications', 'own-no-submission', user?.email, today],
    queryFn: () => fetchOwnAlert(user!.email, today),
    enabled: Boolean(user && !isManager),
    refetchInterval: 60000,
  })

  const previousMissingKeysRef = useRef<Set<string> | null>(null)
  useEffect(() => {
    if (!isManager || !missingContributors) return
    const currentKeys = new Set(missingContributors.map((c) => c.email.toLowerCase()))
    const previousKeys = previousMissingKeysRef.current
    if (previousKeys && [...currentKeys].some((key) => !previousKeys.has(key))) {
      playSound(ALERT_NOTIFICATION_SOUND)
    }
    previousMissingKeysRef.current = currentKeys
  }, [isManager, missingContributors])

  const previousOwnAlertRef = useRef<boolean | null>(null)
  useEffect(() => {
    if (isManager || ownAlert === undefined) return
    if (previousOwnAlertRef.current === false && ownAlert) {
      playSound(ALERT_NOTIFICATION_SOUND)
    }
    previousOwnAlertRef.current = ownAlert
  }, [isManager, ownAlert])

  const visibleContributors = (missingContributors ?? []).filter((c) => !dismissed.has(c.email.toLowerCase()))
  const ownVisible = Boolean(ownAlert) && !dismissed.has('__own__')
  const count = isManager ? visibleContributors.length : ownVisible ? 1 : 0

  function dismiss(key: string) {
    setDismissed((prev) => {
      const next = new Set(prev)
      next.add(key)
      saveDismissed(dismissedKey, next)
      return next
    })
  }

  function clearAll() {
    setDismissed((prev) => {
      const next = new Set(prev)
      for (const c of missingContributors ?? []) next.add(c.email.toLowerCase())
      if (ownAlert) next.add('__own__')
      saveDismissed(dismissedKey, next)
      return next
    })
  }

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
                <button onClick={clearAll} className="text-xs font-medium text-sky-700 hover:underline">
                  Clear all
                </button>
              )}
            </div>
            {isManager ? (
              <div className="flex max-h-80 flex-col gap-1 overflow-y-auto">
                {visibleContributors.length === 0 && (
                  <div className="px-2 py-3 text-sm text-gray-400">Nothing to show.</div>
                )}
                {visibleContributors.map((c) => (
                  <div key={c.email} className="group flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-gray-50">
                    <Link
                      to={`/contributors/${encodeURIComponent(c.email)}`}
                      onClick={() => setOpen(false)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-sm"
                    >
                      <Avatar name={c.name || c.email} size={28} />
                      <div className="min-w-0">
                        <div className="truncate font-medium text-gray-900">{c.name}</div>
                        <div className="truncate text-xs text-gray-400">No submission today</div>
                      </div>
                    </Link>
                    <button
                      onClick={() => dismiss(c.email.toLowerCase())}
                      className="shrink-0 rounded p-1 text-gray-300 hover:bg-gray-200 hover:text-gray-600"
                      aria-label={`Dismiss ${c.name}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            ) : ownVisible ? (
              <div className="flex items-start gap-2 px-2 py-3">
                <div className="text-sm text-gray-600">
                  You haven't logged a submission today.{' '}
                  {user && (
                    <Link
                      to={`/contributors/${encodeURIComponent(user.email)}`}
                      onClick={() => setOpen(false)}
                      className="font-medium text-sky-700 hover:underline"
                    >
                      Add one now
                    </Link>
                  )}
                </div>
                <button
                  onClick={() => dismiss('__own__')}
                  className="shrink-0 rounded p-1 text-gray-300 hover:bg-gray-200 hover:text-gray-600"
                  aria-label="Dismiss"
                >
                  ×
                </button>
              </div>
            ) : (
              <div className="px-2 py-3 text-sm text-gray-400">Nothing to show.</div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
