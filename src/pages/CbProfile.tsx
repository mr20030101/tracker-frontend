import { useMemo, useState } from 'react'
import { Navigate, useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { startOfWeek, toISODate, formatRange } from '../lib/week'
import type { ContributorProfile, TaskSubmission } from '../types'
import { Avatar } from '../components/Avatar'
import { StatusPill } from '../components/StatusPill'
import { ProgressBar } from '../components/ProgressBar'
import { TaskSubmissionForm } from '../components/TaskSubmissionForm'
import { SortableHeader } from '../components/SortableHeader'

const MANAGER_ROLES = ['admin', 'lead']

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-5 py-4">
      <div className="text-xs font-medium uppercase tracking-wider text-gray-400">{label}</div>
      <div className="mt-1 text-2xl font-bold text-gray-900">{value}</div>
    </div>
  )
}

export function CbProfile() {
  const { user: currentUser } = useAuth()
  const { email = '' } = useParams<{ email: string }>()
  const decodedEmail = decodeURIComponent(email)

  const isOwnProfile = currentUser?.email.toLowerCase() === decodedEmail.toLowerCase()

  const [formTarget, setFormTarget] = useState<'new' | TaskSubmission | null>(null)
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('day')
  const [anchorDate, setAnchorDate] = useState(() => new Date())
  const thisWeekIso = useMemo(() => toISODate(startOfWeek(new Date())), [])

  type SortKey = 'task_id' | 'project' | 'stage' | 'status' | 'date'
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'date', dir: 'desc' })
  const [page, setPage] = useState(1)
  const pageSize = 10

  const { data, isLoading } = useQuery({
    queryKey: ['contributor', decodedEmail, thisWeekIso],
    queryFn: async () =>
      (
        await api.get<ContributorProfile>('/contributor', {
          params: { email: decodedEmail, week_start: thisWeekIso },
        })
      ).data,
    enabled: Boolean(decodedEmail),
  })

  const rangeStart = useMemo(() => {
    if (viewMode === 'day') return toISODate(anchorDate)
    if (viewMode === 'week') return toISODate(startOfWeek(anchorDate))
    return toISODate(new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1))
  }, [viewMode, anchorDate])

  const rangeEnd = useMemo(() => {
    if (viewMode === 'day') return toISODate(anchorDate)
    if (viewMode === 'week') {
      const d = startOfWeek(anchorDate)
      d.setDate(d.getDate() + 6)
      return toISODate(d)
    }
    return toISODate(new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 0))
  }, [viewMode, anchorDate])

  const isCurrentRange = useMemo(() => {
    const today = new Date()
    if (viewMode === 'day') return rangeStart === toISODate(today)
    if (viewMode === 'week') return rangeStart === toISODate(startOfWeek(today))
    return anchorDate.getFullYear() === today.getFullYear() && anchorDate.getMonth() === today.getMonth()
  }, [viewMode, rangeStart, anchorDate])

  function shiftRange(direction: 1 | -1) {
    setAnchorDate((prev) => {
      const next = new Date(prev)
      if (viewMode === 'day') next.setDate(next.getDate() + direction)
      else if (viewMode === 'week') next.setDate(next.getDate() + direction * 7)
      else {
        next.setDate(1)
        next.setMonth(next.getMonth() + direction)
      }
      return next
    })
    setPage(1)
  }

  function rangeLabel(): string {
    if (viewMode === 'day') {
      return new Date(`${rangeStart}T00:00:00`).toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    }
    if (viewMode === 'week') return formatRange(rangeStart, rangeEnd)
    return anchorDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  }

  if (isLoading || !data) {
    return <div className="text-gray-400">Loading...</div>
  }

  if (data.user && data.user.role !== 'contributor' && !isOwnProfile) {
    return <Navigate to="/" replace />
  }

  const canEdit = isOwnProfile || Boolean(currentUser && MANAGER_ROLES.includes(currentUser.role))

  const displayName = data.user?.name ?? decodedEmail
  const stages = Object.entries(data.stage_breakdown) as [string, number][]
  const visibleSubmissions = data.all_submissions.filter((row) => {
    const d = row.date?.slice(0, 10)
    return d && d >= rangeStart && d <= rangeEnd
  })

  function sortValue(row: TaskSubmission): string {
    switch (sort.key) {
      case 'task_id':
        return row.task_id ?? ''
      case 'project':
        return row.project?.name ?? ''
      case 'stage':
        return row.stage
      case 'status':
        return row.status
      case 'date':
        return row.date ?? ''
    }
  }

  const sortedSubmissions = [...visibleSubmissions].sort((a, b) => {
    const cmp = sortValue(a).localeCompare(sortValue(b))
    return sort.dir === 'asc' ? cmp : -cmp
  })

  const rangeTarget =
    viewMode === 'day'
      ? Math.round(data.weekly_target / 5)
      : viewMode === 'week'
        ? data.weekly_target
        : data.weekly_target * 4
  const submittedInRange = visibleSubmissions.filter((row) => row.status === 'submitted').length
  const loggedInRange = visibleSubmissions.length
  const rangeProgress = rangeTarget > 0 ? submittedInRange / rangeTarget : 0
  const viewLabel = viewMode === 'day' ? 'Day' : viewMode === 'week' ? 'Week' : 'Month'

  const totalPages = Math.max(1, Math.ceil(sortedSubmissions.length / pageSize))
  const pagedSubmissions = sortedSubmissions.slice((page - 1) * pageSize, page * pageSize)

  function toggleSort(key: SortKey) {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
  }

  return (
    <div>
      <Link to="/" className="mb-4 inline-block text-sm text-gray-500 hover:text-gray-800">
        ← Back to Dashboard
      </Link>

      <div className="mb-6 flex items-center gap-4">
        <Avatar name={displayName} size={56} />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{displayName}</h1>
          <p className="text-sm text-gray-500">{decodedEmail}</p>
        </div>
        {data.user && (
          <span className="ml-auto rounded-full bg-status-neutral-bg px-3 py-1 text-xs font-medium capitalize text-status-neutral-text">
            {data.user.role}
          </span>
        )}
      </div>

      {data.submitted_this_week === 0 && (!data.user || data.user.is_active) && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border-2 border-status-danger-text bg-status-danger-text px-5 py-4 text-sm font-semibold text-white shadow-sm">
          <span className="animate-heartbeat text-lg leading-none">⚠</span>
          <span>WARNING: No submissions logged yet this week.</span>
        </div>
      )}

      {data.user?.shift && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white px-5 py-4 text-sm text-gray-600">
          <span className="font-medium text-gray-700">Shift:</span> {data.user.shift}
          {data.user.meet_link && (
            <>
              <span className="mx-2 text-gray-300">|</span>
              <a href={data.user.meet_link} target="_blank" rel="noreferrer" className="text-sky-700 hover:underline">
                Meet link
              </a>
            </>
          )}
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label={`Submitted (${viewLabel})`} value={submittedInRange} />
        <StatCard label={`Logged (${viewLabel})`} value={loggedInRange} />
        <div className="rounded-xl border border-gray-200 bg-white px-5 py-4">
          <div className="text-xs font-medium uppercase tracking-wider text-gray-400">{`Target (${viewLabel})`}</div>
          <div className="mt-1 text-2xl font-bold text-gray-900">{`${submittedInRange} / ${rangeTarget}`}</div>
          <div className="mt-1 text-xs text-gray-400">Minimum goal — submit as much as you want, no upper limit.</div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-5 py-4">
          <div className="text-xs font-medium uppercase tracking-wider text-gray-400">{viewLabel} Progress</div>
          <div className="mt-2">
            <ProgressBar value={rangeProgress} />
          </div>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="mb-3 text-sm font-semibold text-gray-700">By Stage (all-time)</div>
          <ul className="flex flex-col gap-2">
            {stages.length === 0 && <li className="text-sm text-gray-400">No submissions yet.</li>}
            {stages.map(([stage, total]) => (
              <li key={stage} className="flex items-center justify-between text-sm">
                <span className="uppercase text-gray-600">{stage}</span>
                <span className="font-medium text-gray-900">{total}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="mb-3 text-sm font-semibold text-gray-700">By Project (all-time)</div>
          <ul className="flex flex-col gap-2">
            {data.project_breakdown.length === 0 && <li className="text-sm text-gray-400">No submissions yet.</li>}
            {data.project_breakdown.map((p) => (
              <li key={p.name} className="flex items-center justify-between text-sm">
                <span className="text-gray-600">{p.name}</span>
                <span className="font-medium text-gray-900">{p.total}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-gray-200 bg-white p-1">
          {(['day', 'week', 'month'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => {
                setViewMode(mode)
                setPage(1)
              }}
              className={`rounded-md px-3 py-1 text-sm font-medium capitalize ${viewMode === mode ? 'bg-accent text-accent-foreground' : 'text-gray-600'}`}
            >
              {mode}
            </button>
          ))}
        </div>

        <button
          onClick={() => shiftRange(-1)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          ← Prev
        </button>
        <div className="min-w-48 rounded-lg border border-gray-200 bg-white px-4 py-2 text-center text-sm font-medium text-gray-700">
          {rangeLabel()}
        </div>
        <button
          onClick={() => shiftRange(1)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          Next →
        </button>
        {!isCurrentRange && (
          <button
            onClick={() => {
              setAnchorDate(new Date())
              setPage(1)
            }}
            className="text-sm font-medium text-sky-700 hover:underline"
          >
            Back to {viewMode === 'day' ? 'today' : viewMode === 'week' ? 'this week' : 'this month'}
          </button>
        )}

        {canEdit && (
          <button
            onClick={() => setFormTarget('new')}
            className="ml-auto rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
          >
            + Add Submission
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-200 bg-gray-50 px-5 py-3 text-sm font-semibold text-gray-700">
          Submissions — {rangeLabel()}
        </div>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
            <tr>
              <SortableHeader
                label="Task ID"
                active={sort.key === 'task_id'}
                dir={sort.dir}
                onClick={() => toggleSort('task_id')}
              />
              <SortableHeader
                label="Project"
                active={sort.key === 'project'}
                dir={sort.dir}
                onClick={() => toggleSort('project')}
              />
              <SortableHeader
                label="Stage"
                active={sort.key === 'stage'}
                dir={sort.dir}
                onClick={() => toggleSort('stage')}
              />
              <SortableHeader
                label="Status"
                active={sort.key === 'status'}
                dir={sort.dir}
                onClick={() => toggleSort('status')}
              />
              <SortableHeader
                label="Date"
                active={sort.key === 'date'}
                dir={sort.dir}
                onClick={() => toggleSort('date')}
              />
              {canEdit && <th className="px-5 py-3 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {pagedSubmissions.length === 0 && (
              <tr>
                <td colSpan={canEdit ? 6 : 5} className="px-5 py-6 text-center text-gray-400">
                  No submissions for this {viewMode}.
                </td>
              </tr>
            )}
            {pagedSubmissions.map((row) => (
              <tr key={row.id} className="hover:bg-gray-50">
                <td className="max-w-40 truncate px-5 py-3 font-mono text-xs text-gray-500">
                  {row.task_id ?? '—'}
                </td>
                <td className="px-5 py-3 text-gray-600">{row.project?.name ?? '—'}</td>
                <td className="px-5 py-3 uppercase text-gray-600">{row.stage}</td>
                <td className="px-5 py-3">
                  <StatusPill status={row.status} />
                </td>
                <td className="px-5 py-3 text-gray-500">{row.date?.slice(0, 10) ?? '—'}</td>
                {canEdit && (
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => setFormTarget(row)}
                      className="text-xs font-medium text-gray-500 hover:text-gray-900"
                    >
                      Edit
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>

        {sortedSubmissions.length > 0 && (
          <div className="flex items-center justify-between border-t border-gray-200 px-5 py-3 text-sm text-gray-500">
            <span>
              Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, sortedSubmissions.length)} of{' '}
              {sortedSubmissions.length}
            </span>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="rounded-lg border border-gray-200 px-3 py-1 disabled:opacity-40"
              >
                Prev
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border border-gray-200 px-3 py-1 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {formTarget && (
        <TaskSubmissionForm
          submission={formTarget === 'new' ? undefined : formTarget}
          onClose={() => setFormTarget(null)}
        />
      )}
    </div>
  )
}
