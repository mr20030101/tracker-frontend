import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/api'
import { useAuth } from '../lib/auth'

const MANAGER_ROLES = ['admin', 'lead']
const TOAST_LIFETIME_MS = 6000

interface Toast {
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

export function RealtimeSubmissionToasts() {
  const { user } = useAuth()
  const isManager = Boolean(user && MANAGER_ROLES.includes(user.role))
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const { data: profileNames } = useQuery({
    queryKey: ['profiles-by-email'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('email, name')
      return new Map((data ?? []).map((p) => [p.email.toLowerCase(), p.name as string]))
    },
    enabled: isManager,
    staleTime: 5 * 60 * 1000,
  })

  const { data: projectNames } = useQuery({
    queryKey: ['projects-by-id'],
    queryFn: async () => {
      const { data } = await supabase.from('projects').select('id, name')
      return new Map((data ?? []).map((p) => [p.id as number, p.name as string]))
    },
    enabled: isManager,
    staleTime: 5 * 60 * 1000,
  })

  useEffect(() => {
    if (!isManager) return

    function addToast(row: TaskSubmissionRow) {
      const name = profileNames?.get(row.cb_email.toLowerCase()) ?? row.cb_email
      const project = row.project_id != null ? (projectNames?.get(row.project_id) ?? null) : null
      const id = `${row.id}-${Date.now()}`
      setToasts((prev) => [...prev, { id, name, project }])
      const timer = setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id))
        timers.current.delete(id)
      }, TOAST_LIFETIME_MS)
      timers.current.set(id, timer)
    }

    const channel = supabase
      .channel('task-submissions-live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'task_submissions' },
        (payload) => {
          const row = payload.new as TaskSubmissionRow
          if (row.status === 'submitted') addToast(row)
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'task_submissions' },
        (payload) => {
          const row = payload.new as TaskSubmissionRow
          const old = payload.old as Partial<TaskSubmissionRow>
          if (row.status === 'submitted' && old.status !== 'submitted') addToast(row)
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      for (const timer of timers.current.values()) clearTimeout(timer)
      timers.current.clear()
    }
  }, [isManager, profileNames, projectNames])

  function dismiss(id: string) {
    const timer = timers.current.get(id)
    if (timer) clearTimeout(timer)
    timers.current.delete(id)
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  if (!isManager || toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 text-sm shadow-lg"
        >
          <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-status-success-text" />
          <div className="min-w-0 flex-1">
            <div className="font-medium text-gray-900">{toast.name} submitted a task</div>
            {toast.project && <div className="text-xs text-gray-400">{toast.project}</div>}
          </div>
          <button onClick={() => dismiss(toast.id)} className="shrink-0 text-gray-300 hover:text-gray-600" aria-label="Dismiss">
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
