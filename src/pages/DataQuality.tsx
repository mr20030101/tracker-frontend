import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/api'
import { TaskSubmissionForm } from '../components/TaskSubmissionForm'
import type { TaskSubmission } from '../types'

const HIGH_VOLUME_THRESHOLD = 20

interface Row {
  id: number
  task_id: string | null
  cb_email: string
  project_id: number | null
  date: string | null
  status: string
  stage: string
}

async function fetchAll(): Promise<Row[]> {
  const { data, error } = await supabase
    .from('task_submissions')
    .select('id, task_id, cb_email, project_id, date, status, stage')
    .order('date', { ascending: false })
  if (error) throw error
  return (data ?? []) as Row[]
}

function Section({
  title,
  count,
  description,
  actions,
  children,
}: {
  title: string
  count: number
  description: string
  actions?: ReactNode
  children: ReactNode
}) {
  const [open, setOpen] = useState(true)
  return (
    <div className="mb-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="flex w-full items-center justify-between px-5 py-4">
        <button onClick={() => setOpen((v) => !v)} className="flex flex-1 items-center gap-2 text-left">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
              {count > 0 && (
                <span className="rounded-full bg-status-danger-bg px-2 py-0.5 text-xs font-semibold text-status-danger-text">
                  {count}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-gray-500">{description}</p>
          </div>
        </button>
        <div className="flex shrink-0 items-center gap-3">
          {actions}
          <button onClick={() => setOpen((v) => !v)} className="text-gray-400" aria-label={open ? 'Collapse' : 'Expand'}>
            {open ? '▲' : '▼'}
          </button>
        </div>
      </div>
      {open && count > 0 && <div className="border-t border-gray-200">{children}</div>}
    </div>
  )
}

export function DataQuality() {
  const queryClient = useQueryClient()
  const [editTarget, setEditTarget] = useState<TaskSubmission | null>(null)

  const { data: rows, isLoading } = useQuery({
    queryKey: ['data-quality-rows'],
    queryFn: fetchAll,
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from('task_submissions').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['data-quality-rows'] })
      queryClient.invalidateQueries({ queryKey: ['task-submissions'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] })
      queryClient.invalidateQueries({ queryKey: ['contributor'] })
    },
  })

  const all = useMemo(() => rows ?? [], [rows])

  const duplicates = useMemo(() => {
    const groups = new Map<string, Row[]>()
    for (const row of all) {
      if (!row.task_id) continue
      const list = groups.get(row.task_id) ?? []
      list.push(row)
      groups.set(row.task_id, list)
    }
    return [...groups.entries()].filter(([, list]) => list.length > 1)
  }, [all])
  const duplicateRowCount = duplicates.reduce((sum, [, list]) => sum + list.length, 0)

  const missingProject = useMemo(() => all.filter((r) => r.task_id && r.project_id == null), [all])
  const missingTaskId = useMemo(() => all.filter((r) => !r.task_id && r.cb_email), [all])

  const highVolume = useMemo(() => {
    const groups = new Map<string, { cb_email: string; date: string; count: number }>()
    for (const row of all) {
      if (!row.date) continue
      const key = `${row.cb_email}|${row.date}`
      const existing = groups.get(key)
      if (existing) existing.count += 1
      else groups.set(key, { cb_email: row.cb_email, date: row.date, count: 1 })
    }
    return [...groups.values()].filter((g) => g.count > HIGH_VOLUME_THRESHOLD).sort((a, b) => b.count - a.count)
  }, [all])

  const deleteAllMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const { error } = await supabase.from('task_submissions').delete().in('id', ids)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['data-quality-rows'] })
      queryClient.invalidateQueries({ queryKey: ['task-submissions'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] })
      queryClient.invalidateQueries({ queryKey: ['contributor'] })
    },
  })

  function handleDelete(id: number) {
    if (confirm('Delete this submission?')) deleteMutation.mutate(id)
  }

  function handleDeleteAll(ids: number[]) {
    if (confirm(`Delete all ${ids.length} submissions with no Task ID? This cannot be undone.`)) {
      deleteAllMutation.mutate(ids)
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Data Quality</h1>
        <p className="text-sm text-gray-500">Automated checks across all task log submissions.</p>
      </div>

      {isLoading && <div className="text-gray-400">Loading...</div>}

      {!isLoading && (
        <>
          <Section
            title="Duplicate Task IDs"
            count={duplicateRowCount}
            description="The same Task ID appears in more than one submission."
          >
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-5 py-2">Task ID</th>
                  <th className="px-5 py-2">CB Email</th>
                  <th className="px-5 py-2">Date</th>
                  <th className="px-5 py-2">Status</th>
                  <th className="px-5 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {duplicates.map(([taskId, group]) =>
                  group.map((row, i) => (
                    <tr key={row.id} className={i === 0 ? 'bg-status-warning-bg/40' : ''}>
                      <td className="max-w-40 truncate px-5 py-2 font-mono text-xs text-gray-500">{taskId}</td>
                      <td className="px-5 py-2">
                        <Link
                          to={`/contributors/${encodeURIComponent(row.cb_email)}`}
                          className="text-sky-700 hover:underline"
                        >
                          {row.cb_email}
                        </Link>
                      </td>
                      <td className="px-5 py-2 text-gray-500">{row.date ?? '—'}</td>
                      <td className="px-5 py-2 text-gray-600">{row.status}</td>
                      <td className="px-5 py-2 text-right">
                        <button
                          onClick={() => handleDelete(row.id)}
                          className="text-xs font-medium text-status-danger-text hover:underline"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </Section>

          <Section
            title="Missing Project"
            count={missingProject.length}
            description="Submissions with a Task ID but no project assigned."
          >
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-5 py-2">Task ID</th>
                  <th className="px-5 py-2">CB Email</th>
                  <th className="px-5 py-2">Date</th>
                  <th className="px-5 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {missingProject.map((row) => (
                  <tr key={row.id}>
                    <td className="max-w-40 truncate px-5 py-2 font-mono text-xs text-gray-500">{row.task_id}</td>
                    <td className="px-5 py-2">
                      <Link
                        to={`/contributors/${encodeURIComponent(row.cb_email)}`}
                        className="text-sky-700 hover:underline"
                      >
                        {row.cb_email}
                      </Link>
                    </td>
                    <td className="px-5 py-2 text-gray-500">{row.date ?? '—'}</td>
                    <td className="px-5 py-2 text-right">
                      <button
                        onClick={() => setEditTarget(row as unknown as TaskSubmission)}
                        className="text-xs font-medium text-gray-500 hover:text-gray-900"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          <Section
            title="Missing Task ID"
            count={missingTaskId.length}
            description="Submissions with no Task ID recorded (may be intentional blank placeholders)."
            actions={
              missingTaskId.length > 0 && (
                <button
                  onClick={() => handleDeleteAll(missingTaskId.map((row) => row.id))}
                  disabled={deleteAllMutation.isPending}
                  className="text-xs font-medium text-status-danger-text hover:underline disabled:opacity-50"
                >
                  {deleteAllMutation.isPending ? 'Deleting...' : 'Delete All'}
                </button>
              )
            }
          >
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-5 py-2">CB Email</th>
                  <th className="px-5 py-2">Date</th>
                  <th className="px-5 py-2">Status</th>
                  <th className="px-5 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {missingTaskId.map((row) => (
                  <tr key={row.id}>
                    <td className="px-5 py-2">
                      <Link
                        to={`/contributors/${encodeURIComponent(row.cb_email)}`}
                        className="text-sky-700 hover:underline"
                      >
                        {row.cb_email}
                      </Link>
                    </td>
                    <td className="px-5 py-2 text-gray-500">{row.date ?? '—'}</td>
                    <td className="px-5 py-2 text-gray-600">{row.status}</td>
                    <td className="px-5 py-2 text-right">
                      <button
                        onClick={() => handleDelete(row.id)}
                        className="text-xs font-medium text-status-danger-text hover:underline"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          <Section
            title="Unusually High Daily Volume"
            count={highVolume.length}
            description={`More than ${HIGH_VOLUME_THRESHOLD} submissions from one contributor on a single day — possible bulk-entry error.`}
          >
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-5 py-2">CB Email</th>
                  <th className="px-5 py-2">Date</th>
                  <th className="px-5 py-2">Count</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {highVolume.map((g) => (
                  <tr key={`${g.cb_email}-${g.date}`}>
                    <td className="px-5 py-2">
                      <Link
                        to={`/contributors/${encodeURIComponent(g.cb_email)}`}
                        className="text-sky-700 hover:underline"
                      >
                        {g.cb_email}
                      </Link>
                    </td>
                    <td className="px-5 py-2 text-gray-500">{g.date}</td>
                    <td className="px-5 py-2 font-semibold text-gray-900">{g.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          {duplicateRowCount === 0 &&
            missingProject.length === 0 &&
            missingTaskId.length === 0 &&
            highVolume.length === 0 && (
              <div className="rounded-xl border border-status-success-text/30 bg-status-success-bg px-5 py-4 text-sm text-status-success-text">
                No data quality issues found.
              </div>
            )}
        </>
      )}

      {editTarget && <TaskSubmissionForm submission={editTarget} onClose={() => setEditTarget(null)} />}
    </div>
  )
}
