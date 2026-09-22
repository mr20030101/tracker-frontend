import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/api'
import { useAuth } from '../lib/auth'
import { toISODate } from '../lib/week'
import { reportBadVideo } from '../lib/taskRequests'
import { Modal } from './Modal'

interface TaskLookupRow {
  id: number
  task_id: string | null
  cb_email: string
  date: string | null
}

interface Props {
  /** Already known (opened from a task row) — skips the search step. */
  submission?: { id: number; task_id: string | null; cb_email: string } | null
  onClose: () => void
}

// Every report so far has been Remote / Grey Owls, so these aren't asked for — fixed rather than
// left editable-but-hidden, since there's nowhere in this form for someone to change them anyway.
const WORKFORCE: 'REMOTE' | 'ONSITE' = 'REMOTE'
const WORKFORCE_NAME = 'Grey Owls'

/** Files a "Bad Video Validation/Removal" report (ALOHA | URSA | YAM) against a task's claimed
 * video — the counterpart to requesting an extension, but a QA flag rather than self-service.
 * Opened either with the task already known (a row's ActionsMenu) or blank (the Requests page's
 * "New report" button), in which case it searches task_submissions by Task ID or CB email first. */
export function BadVideoReportModal({ submission: initialSubmission, onClose }: Props) {
  const { user: currentUser } = useAuth()
  const queryClient = useQueryClient()
  const [submission, setSubmission] = useState(initialSubmission ?? null)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [frame, setFrame] = useState('')

  // A bad video is only reportable same-day, so there's no point surfacing (or letting someone
  // pick) a task logged on any other day.
  const today = toISODate(new Date())

  const { data: matches = [], isFetching } = useQuery({
    queryKey: ['task-lookup', search, today],
    queryFn: async (): Promise<TaskLookupRow[]> => {
      const term = search.trim().replace(/[%,]/g, '')
      const { data, error } = await supabase
        .from('task_submissions')
        .select('id, task_id, cb_email, date')
        .eq('date', today)
        .or(`task_id.ilike.%${term}%,cb_email.ilike.%${term}%`)
        .order('date', { ascending: false })
        .limit(20)
      if (error) throw error
      return data as TaskLookupRow[]
    },
    enabled: !submission && search.trim().length >= 3,
  })

  const reportMutation = useMutation({
    mutationFn: async () => {
      if (!currentUser || !submission) throw new Error('Pick a task first.')
      await reportBadVideo({
        submissionId: submission.id,
        requestedBy: currentUser.id,
        category: category.trim(),
        frame: frame.trim(),
        workforce: WORKFORCE,
        workforceName: WORKFORCE_NAME,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task-requests'] })
      onClose()
    },
  })

  return (
    <Modal title="Report a bad video?" onClose={onClose}>
      {!submission ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-gray-600">
            Search by Task ID or CB email to find the task. Only tasks logged today are reportable.
          </p>
          <input
            autoFocus
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Task ID or CB email..."
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-200">
            {search.trim().length < 3 && (
              <div className="px-3 py-4 text-center text-sm text-gray-400">Type at least 3 characters.</div>
            )}
            {search.trim().length >= 3 && isFetching && (
              <div className="px-3 py-4 text-center text-sm text-gray-400">Searching...</div>
            )}
            {search.trim().length >= 3 && !isFetching && matches.length === 0 && (
              <div className="px-3 py-4 text-center text-sm text-gray-400">No matching tasks.</div>
            )}
            {matches.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => setSubmission({ id: row.id, task_id: row.task_id, cb_email: row.cb_email })}
                className="flex w-full flex-col items-start gap-0.5 border-b border-gray-100 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-gray-50"
              >
                <span className="font-mono text-xs text-gray-500">{row.task_id ?? '—'}</span>
                <span className="text-gray-700">
                  {row.cb_email} {row.date && <span className="text-gray-400">· {row.date.slice(0, 10)}</span>}
                </span>
              </button>
            ))}
          </div>
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            reportMutation.mutate()
          }}
          className="flex flex-col gap-3"
        >
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
            <div className="font-mono text-xs text-gray-500">{submission.task_id ?? '—'}</div>
            <div className="text-gray-700">{submission.cb_email}</div>
            {!initialSubmission && (
              <button
                type="button"
                onClick={() => setSubmission(null)}
                className="mt-1 text-xs font-medium text-sky-700 hover:underline"
              >
                Change task
              </button>
            )}
          </div>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-gray-700">Bad video category</span>
            <input
              required
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. Wrong subject"
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-gray-700">Frame</span>
            <input
              required
              value={frame}
              onChange={(e) => setFrame(e.target.value)}
              placeholder="Specific frame for the bad video flag"
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </label>
          {reportMutation.isError && (
            <div className="text-sm text-status-danger-text">
              {reportMutation.error instanceof Error ? reportMutation.error.message : 'Could not file this report.'}
            </div>
          )}
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={reportMutation.isPending}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
            >
              {reportMutation.isPending ? 'Filing...' : 'File report'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}
