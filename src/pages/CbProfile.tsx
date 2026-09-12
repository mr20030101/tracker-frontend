import { useMemo, useState } from 'react'
import { Navigate, useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { startOfWeek, toISODate, formatRange } from '../lib/week'
import type { ContributorProfile } from '../types'
import { Avatar } from '../components/Avatar'
import { StatusPill } from '../components/StatusPill'
import { ProgressBar } from '../components/ProgressBar'

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

  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const weekStartIso = useMemo(() => toISODate(weekStart), [weekStart])
  const thisWeekIso = useMemo(() => toISODate(startOfWeek(new Date())), [])
  const isCurrentWeek = weekStartIso === thisWeekIso

  const { data, isLoading } = useQuery({
    queryKey: ['contributor', decodedEmail, weekStartIso],
    queryFn: async () =>
      (
        await api.get<ContributorProfile>('/contributor', {
          params: { email: decodedEmail, week_start: weekStartIso },
        })
      ).data,
    enabled: Boolean(decodedEmail),
  })

  function shiftWeek(days: number) {
    setWeekStart((prev) => {
      const next = new Date(prev)
      next.setDate(next.getDate() + days)
      return next
    })
  }

  if (isLoading || !data) {
    return <div className="text-gray-400">Loading...</div>
  }

  const isOwnProfile = currentUser?.email.toLowerCase() === decodedEmail.toLowerCase()
  if (data.user && data.user.role !== 'contributor' && !isOwnProfile) {
    return <Navigate to="/" replace />
  }

  const displayName = data.user?.name ?? decodedEmail
  const progress = data.weekly_target > 0 ? data.submitted_this_week / data.weekly_target : 0
  const stages = Object.entries(data.stage_breakdown) as [string, number][]

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
          <span>
            {isCurrentWeek
              ? 'WARNING: No submissions logged yet this week.'
              : `WARNING: No submissions were logged for the week of ${formatRange(data.week_start, data.week_end)}.`}
          </span>
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
        <StatCard label="Submitted (all-time)" value={data.total_submitted} />
        <StatCard label="Logged (all-time)" value={data.total_logged} />
        <StatCard label="Submitted This Week" value={`${data.submitted_this_week} / ${data.weekly_target}`} />
        <div className="rounded-xl border border-gray-200 bg-white px-5 py-4">
          <div className="text-xs font-medium uppercase tracking-wider text-gray-400">Weekly Progress</div>
          <div className="mt-2">
            <ProgressBar value={progress} />
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

      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={() => shiftWeek(-7)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          ← Prev Week
        </button>
        <div className="min-w-48 rounded-lg border border-gray-200 bg-white px-4 py-2 text-center text-sm font-medium text-gray-700">
          {formatRange(data.week_start, data.week_end)}
        </div>
        <button
          onClick={() => shiftWeek(7)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          Next Week →
        </button>
        {!isCurrentWeek && (
          <button
            onClick={() => setWeekStart(startOfWeek(new Date()))}
            className="text-sm font-medium text-sky-700 hover:underline"
          >
            Back to this week
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-200 bg-gray-50 px-5 py-3 text-sm font-semibold text-gray-700">
          Submissions — {formatRange(data.week_start, data.week_end)}
        </div>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
            <tr>
              <th className="px-5 py-3">Task ID</th>
              <th className="px-5 py-3">Project</th>
              <th className="px-5 py-3">Stage</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.week_submissions.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-6 text-center text-gray-400">
                  No submissions for this week.
                </td>
              </tr>
            )}
            {data.week_submissions.map((row) => (
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
