import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { MessageCircle } from 'lucide-react'
import { api } from '../lib/api'
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, yearMonth, toISODate, formatRange } from '../lib/week'
import { useMessaging } from '../lib/messagingContext'
import type { DashboardSummary } from '../types'
import { LineChart } from '../components/LineChart'

export function Dashboard() {
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('week')
  const [anchorDate, setAnchorDate] = useState(() => new Date())
  const { usersById, myId, openChatWith } = useMessaging()
  const admin = useMemo(() => [...usersById.values()].find((u) => u.role === 'admin' && u.id !== myId), [usersById, myId])

  const rangeStart = useMemo(() => {
    if (viewMode === 'day') return toISODate(anchorDate)
    if (viewMode === 'week') return toISODate(startOfWeek(anchorDate))
    return toISODate(startOfMonth(anchorDate))
  }, [viewMode, anchorDate])

  const rangeEnd = useMemo(() => {
    if (viewMode === 'day') return toISODate(anchorDate)
    if (viewMode === 'week') return toISODate(endOfWeek(anchorDate))
    return toISODate(endOfMonth(anchorDate))
  }, [viewMode, anchorDate])

  const isCurrentRange = useMemo(() => {
    const today = new Date()
    if (viewMode === 'day') return rangeStart === toISODate(today)
    if (viewMode === 'week') return rangeStart === toISODate(startOfWeek(today))
    const [anchorYear, anchorMonth] = yearMonth(anchorDate)
    const [todayYear, todayMonth] = yearMonth(today)
    return anchorYear === todayYear && anchorMonth === todayMonth
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
    return new Date(`${rangeStart}T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  }

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-summary', rangeStart, rangeEnd, viewMode],
    queryFn: async () =>
      (
        await api.get<DashboardSummary>('/dashboard/summary', {
          params: { range_start: rangeStart, range_end: rangeEnd, view: viewMode },
        })
      ).data,
  })

  const allRows = data?.data ?? []
  const submittedCount = allRows.filter((r) => r.tasks_submitted > 0).length
  const disabledCount = allRows.filter((r) => !r.is_active).length
  const noProgressCount = allRows.filter((r) => r.is_active && r.tasks_submitted === 0).length
  const dailyReport = data?.daily_report ?? []
  const periodPhrase = viewMode === 'day' ? 'today' : viewMode === 'week' ? 'this week' : 'this month'

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500">
            {formatRange(rangeStart, rangeEnd)} · {submittedCount} contributors submitted {periodPhrase}
            {disabledCount > 0 && ` · ${disabledCount} disabled`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {noProgressCount > 0 && (
            <Link
              to="/leaderboard"
              className="flex items-center gap-2 rounded-full border border-status-danger-text/30 bg-status-danger-bg px-4 py-2 text-sm font-semibold text-status-danger-text hover:border-status-danger-text"
            >
              <span className="h-2 w-2 rounded-full bg-current" />
              {noProgressCount} with no progress
            </Link>
          )}
          {admin && (
            <button
              onClick={() => openChatWith(admin.id, admin.name)}
              className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              <MessageCircle className="h-4 w-4" />
              Message {admin.name}
            </button>
          )}
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-gray-200 bg-white p-1">
          {(['day', 'week', 'month'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
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
            onClick={() => setAnchorDate(new Date())}
            className="text-sm font-medium text-sky-700 hover:underline"
          >
            Back to {periodPhrase}
          </button>
        )}
        <input
          type="date"
          value={toISODate(anchorDate)}
          onChange={(e) => {
            if (e.target.value) setAnchorDate(new Date(`${e.target.value}T00:00:00`))
          }}
          className="ml-auto rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </div>

      {isLoading && <div className="text-gray-400">Loading...</div>}

      {!isLoading && (
        <>
          {viewMode !== 'day' && (
            <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-700">Submitted Tasks by Day</h3>
                  <span className="text-xs text-gray-400">tasks</span>
                </div>
                <LineChart
                  data={dailyReport.map((day) => ({ date: day.date, value: day.tasks_submitted }))}
                  color="#d4a017"
                  unitLabel="submitted tasks"
                />
              </div>

              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-700">Contributors Active by Day</h3>
                  <span className="text-xs text-gray-400">contributors</span>
                </div>
                <LineChart
                  data={dailyReport.map((day) => ({ date: day.date, value: day.contributors_submitted }))}
                  color="#0284c7"
                  unitLabel="contributors submitted"
                />
              </div>
            </div>
          )}

          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="border-b border-gray-200 px-5 py-4">
              <h2 className="text-sm font-semibold text-gray-900">Daily Submission Report</h2>
              <p className="mt-1 text-xs text-gray-500">Team activity for the selected {viewMode}.</p>
            </div>
            <div className="max-h-[50vh] overflow-auto">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                  <tr>
                    <th className="px-5 py-3">Date</th>
                    <th className="px-5 py-3">Submitted</th>
                    <th className="px-5 py-3">Logged</th>
                    <th className="px-5 py-3">Contributors Submitted</th>
                    <th className="px-5 py-3">No Submissions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {dailyReport.map((day) => (
                    <tr key={day.date} className={day.contributors_without_submissions > 0 ? 'bg-status-danger-bg/30' : ''}>
                      <td className="px-5 py-3 font-medium text-gray-900">{day.date}</td>
                      <td className="px-5 py-3 font-semibold text-gray-900">{day.tasks_submitted}</td>
                      <td className="px-5 py-3 text-gray-600">{day.tasks_logged}</td>
                      <td className="px-5 py-3 text-gray-600">{day.contributors_submitted}</td>
                      <td className="px-5 py-3 font-medium text-status-danger-text">{day.contributors_without_submissions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
