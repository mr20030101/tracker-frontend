import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Square } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api, supabase } from '../lib/api'
import { useMessaging } from '../lib/messagingContext'
import { useNow } from '../lib/useNow'
import { confirmDialog } from '../lib/dialog'
import { STAGE_LABELS } from '../lib/taskAudits'
import { formatTimer, setTaskTimer, timerSeconds } from '../lib/taskTimer'
import type { Project, TaskSubmission } from '../types'

type RunningTask = Pick<TaskSubmission, 'id' | 'task_id' | 'cb_email' | 'user_id' | 'project_id' | 'stage' | 'timer_started_at' | 'timer_elapsed_seconds' | 'created_at'>

const LOGGED_FORMAT = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

/** Lead dashboard: every task whose timer is running right now. RLS limits a lead to their own team. */
export function RunningTasksCard() {
  const now = useNow(1000)
  const { usersById } = useMessaging()
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['task-submissions', 'running'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('task_submissions')
        .select('id, task_id, cb_email, user_id, project_id, stage, timer_started_at, timer_elapsed_seconds, created_at')
        .eq('status', 'in_progress')
        .not('timer_started_at', 'is', null)
        .order('timer_started_at')
      if (error) throw error
      return data as RunningTask[]
    },
    refetchInterval: 30_000,
  })
  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => (await api.get<Project[]>('/projects')).data,
  })
  const queryClient = useQueryClient()
  const stop = useMutation({
    mutationFn: (id: number) => setTaskTimer(id, false),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['task-submissions'] })
      queryClient.invalidateQueries({ queryKey: ['contributor'] })
    },
  })

  async function confirmStop(task: RunningTask, name: string) {
    const ok = await confirmDialog(
      `Stop the timer on ${task.task_id ?? 'this task'} for ${name}? The time so far is kept and the task stays in progress; they can start it again.`,
      { confirmLabel: 'Stop timer', danger: true },
    )
    if (ok) stop.mutate(task.id)
  }

  const rows = tasks
    .map((task) => {
      const project = projects.find((p) => p.id === task.project_id) ?? null
      return { task, project, seconds: timerSeconds(task, now) }
    })
    .sort((a, b) => b.seconds - a.seconds)

  return (
    <div className="mb-4 overflow-hidden card">
      <div className="flex items-baseline justify-between gap-4 border-b border-gray-200 px-5 py-4">
        <div>
          <h2 className="font-display text-lg text-gray-900">Running tasks</h2>
          <p className="mt-1 text-xs text-gray-500">
            Tasks with a timer going now, longest running first.
          </p>
        </div>
        <span className="text-sm font-semibold tabular-nums text-gray-900">{rows.length}</span>
      </div>
      {stop.isError && (
        <div className="border-b border-gray-200 bg-status-danger-bg px-5 py-2 text-sm text-status-danger-text">
          Couldn't stop that timer: {(stop.error as Error).message}
        </div>
      )}
      {isLoading ? (
        <div className="px-5 py-4 text-sm text-gray-400">Loading...</div>
      ) : rows.length === 0 ? (
        <div className="px-5 py-4 text-sm text-gray-500">No timers running right now.</div>
      ) : (
        <div className="max-h-[50vh] overflow-auto">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-5 py-3">Contributor</th>
                <th className="px-5 py-3">Task ID</th>
                <th className="px-5 py-3">Project</th>
                <th className="px-5 py-3">Stage</th>
                <th className="px-5 py-3 text-right">Logged</th>
                <th className="px-5 py-3 text-right">Time</th>
                <th className="px-5 py-3 text-right">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(({ task, project, seconds }) => {
                const name = (task.user_id && usersById.get(task.user_id)?.name) || task.cb_email
                return (
                  <tr key={task.id}>
                    <td className="px-5 py-3">
                      <Link to={`/contributors/${encodeURIComponent(task.cb_email)}`} className="font-medium text-gray-900 hover:underline">
                        {name}
                      </Link>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-gray-600">{task.task_id ?? '—'}</td>
                    <td className="px-5 py-3 text-gray-600">{project?.name ?? '—'}</td>
                    <td className="px-5 py-3 text-gray-600">{STAGE_LABELS[task.stage]}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-right text-xs tabular-nums text-gray-600">{LOGGED_FORMAT.format(new Date(task.created_at))}</td>
                    <td className="px-5 py-3 text-right font-mono text-xs tabular-nums text-status-success-text">{formatTimer(seconds)}</td>
                    <td className="px-5 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => confirmStop(task, name)}
                        aria-busy={stop.isPending && stop.variables === task.id}
                        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-gray-200 px-3 text-xs font-medium text-gray-700 hover:bg-gray-100 pointer-coarse:h-11"
                      >
                        <Square className="h-3 w-3" aria-hidden />
                        {stop.isPending && stop.variables === task.id ? 'Stopping...' : 'Stop'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
