import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Pause, Pencil, Play, Save, X } from 'lucide-react'
import { useNow } from '../lib/useNow'
import { errorMessage } from '../lib/api'
import { formatTimer, isTimerRunning, setTaskTimer, setTaskTimerSeconds, timerSeconds, type TimedTask } from '../lib/taskTimer'
import { Modal } from './Modal'

type TimerTask = TimedTask & { id: number; status: string; task_id?: string | null }

/** The time read out, ticking every second while the timer runs. */
function TimerReadout({ task }: { task: TimedTask }) {
  const now = useNow(1000)
  return <>{formatTimer(timerSeconds(task, now))}</>
}

function invalidateTasks(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['contributor'] })
  queryClient.invalidateQueries({ queryKey: ['task-submissions'] })
}

/**
 * A task's timer: how long has been spent on it, with a start/pause button for someone who can
 * edit the task while it's in progress. `editTime` adds a way to correct the time: 'any' for a
 * lead or admin, 'lower' for a contributor on their own task. Anyone else just sees the time.
 */
export function TaskTimer({ task, canControl, editTime }: { task: TimerTask; canControl: boolean; editTime?: 'any' | 'lower' }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const running = isTimerRunning(task)
  const toggle = useMutation({
    mutationFn: () => setTaskTimer(task.id, !running),
    onSuccess: () => invalidateTasks(queryClient),
  })
  const seconds = timerSeconds(task)
  const controllable = canControl && task.status === 'in_progress'

  if (!controllable && !editTime && seconds === 0 && !running) return <span className="text-xs text-gray-300">—</span>

  return (
    <>
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
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
        {running ? <TimerReadout task={task} /> : formatTimer(seconds)}
      </span>
      {editTime && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label="Edit time"
          title="Edit time"
          className="flex h-6 w-6 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700 pointer-coarse:h-11 pointer-coarse:w-11"
        >
          <Pencil className="h-3 w-3" aria-hidden />
        </button>
      )}
    </span>
    {editing && editTime && (
      // Keeps clicks in the modal from reaching a clickable row behind it.
      <div onClick={(e) => e.stopPropagation()}>
        <EditTimeModal task={task} mode={editTime} onClose={() => setEditing(false)} />
      </div>
    )}
    </>
  )
}

function EditTimeModal({ task, mode, onClose }: { task: TimerTask; mode: 'any' | 'lower'; onClose: () => void }) {
  const queryClient = useQueryClient()
  const start = timerSeconds(task)
  const [hours, setHours] = useState(String(Math.floor(start / 3600)))
  const [minutes, setMinutes] = useState(String(Math.floor((start % 3600) / 60)))
  const [invalid, setInvalid] = useState<string | null>(null)
  const save = useMutation({
    mutationFn: (seconds: number) => setTaskTimerSeconds(task.id, seconds),
    onSuccess: () => {
      invalidateTasks(queryClient)
      onClose()
    },
  })
  const running = isTimerRunning(task)

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (save.isPending) return
    const h = Number(hours || 0)
    const m = Number(minutes || 0)
    if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || m < 0 || m > 59) {
      setInvalid('Enter whole hours, and minutes from 0 to 59.')
      return
    }
    const seconds = h * 3600 + m * 60
    if (seconds > 86400) {
      setInvalid('A task can have at most 24 hours.')
      return
    }
    // A contributor's own timer keeps counting while the modal is open; compare against now.
    if (mode === 'lower' && seconds > timerSeconds(task)) {
      setInvalid('You can only lower your own time. Ask your lead to add time.')
      return
    }
    setInvalid(null)
    save.mutate(seconds)
  }

  const fieldClass = 'w-20 rounded-lg border border-gray-200 px-3 py-2 text-sm tabular-nums outline-none focus:border-accent'
  const error = invalid ?? (save.error ? errorMessage(save.error, "Couldn't save the time.") : null)

  return (
    <Modal title="Edit time" onClose={onClose} maxWidthClassName="max-w-sm">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <p className="text-sm text-gray-600">
          Time on {task.task_id ? <span className="font-mono text-gray-900">{task.task_id}</span> : 'this task'}: {formatTimer(start)}.
          {running && ' The timer keeps running from the new time.'}
          {mode === 'lower' && ' You can lower it if you forgot to pause; your lead can add time.'}
        </p>
        <div className="flex items-end gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
            Hours
            <input type="number" inputMode="numeric" min={0} max={24} value={hours} onChange={(e) => setHours(e.target.value)} className={fieldClass} autoFocus />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-gray-700">
            Minutes
            <input type="number" inputMode="numeric" min={0} max={59} value={minutes} onChange={(e) => setMinutes(e.target.value)} className={fieldClass} />
          </label>
        </div>
        {error && <div className="text-sm text-status-danger-text">{error}</div>}
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600">
            <X className="h-4 w-4" aria-hidden />
            Cancel
          </button>
          <button type="submit" aria-busy={save.isPending} className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground">
            <Save className="h-4 w-4" aria-hidden />
            {save.isPending ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
