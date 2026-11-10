import { useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Pause, Play } from 'lucide-react'
import { useNow } from '../lib/useNow'
import { formatTimer, timerLimitSeconds, isTimerRunning, setTaskTimer, timerSeconds, type TimedTask } from '../lib/taskTimer'

/** The time read out, ticking every second while the timer runs. */
function TimerReadout({ task, limit }: { task: TimedTask; limit: number }) {
  const now = useNow(1000)
  return <>{formatTimer(timerSeconds(task, now, limit))}</>
}

/**
 * A task's timer: how long has been spent on it, with a start/pause button for someone who can
 * edit the task while it's in progress. Anyone else just sees the time.
 */
export function TaskTimer({ task, canControl }: { task: TimedTask & { id: number; status: string; project?: { timer_limit_minutes?: number | null } | null }; canControl: boolean }) {
  const queryClient = useQueryClient()
  const running = isTimerRunning(task)
  const toggle = useMutation({
    mutationFn: () => setTaskTimer(task.id, !running),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contributor'] })
      queryClient.invalidateQueries({ queryKey: ['task-submissions'] })
    },
  })
  const limit = timerLimitSeconds(task.project)
  const seconds = timerSeconds(task, Date.now(), limit)

  // The database expires the task within a minute of the timer reaching its limit; reload then.
  useEffect(() => {
    if (!running) return
    const wait = (limit - timerSeconds(task, Date.now(), limit) + 65) * 1000
    const timeout = setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ['contributor'] })
      queryClient.invalidateQueries({ queryKey: ['task-submissions'] })
    }, wait)
    return () => clearTimeout(timeout)
  }, [running, task, limit, queryClient])
  const controllable = canControl && task.status === 'in_progress'

  if (!controllable && seconds === 0 && !running) return <span className="text-xs text-gray-300">—</span>

  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      {controllable && (
        <button
          type="button"
          onClick={() => toggle.mutate()}
          disabled={toggle.isPending}
          aria-label={running ? 'Pause timer' : 'Start timer'}
          title={toggle.error ? (toggle.error as Error).message : running ? 'Pause timer' : 'Start timer'}
          className={`flex h-6 w-6 items-center justify-center rounded-full disabled:opacity-50 ${
            running ? 'bg-status-success-bg text-status-success-text hover:brightness-95' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
          }`}
        >
          {running ? <Pause className="h-3 w-3" aria-hidden /> : <Play className="h-3 w-3" aria-hidden />}
        </button>
      )}
      <span className={`font-mono text-xs tabular-nums ${running ? 'text-status-success-text' : 'text-gray-500'}`}>
        {running ? <TimerReadout task={task} limit={limit} /> : formatTimer(seconds)}
      </span>
    </span>
  )
}
