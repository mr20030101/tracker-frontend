import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { startOfWeek, toISODate, formatRange } from '../lib/week'
import type { DashboardSummary } from '../types'
import { LineChart } from '../components/LineChart'

export function Dashboard() {
  const rangeStart = toISODate(startOfWeek(new Date()))
  const rangeEnd = (() => {
    const d = startOfWeek(new Date())
    d.setDate(d.getDate() + 6)
    return toISODate(d)
  })()

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-summary', rangeStart, rangeEnd],
    queryFn: async () =>
      (
        await api.get<DashboardSummary>('/dashboard/summary', {
          params: { range_start: rangeStart, range_end: rangeEnd, view: 'week' },
        })
      ).data,
  })

  const allRows = data?.data ?? []
  const submittedCount = allRows.filter((r) => r.tasks_submitted > 0).length
  const disabledCount = allRows.filter((r) => !r.is_active).length
  const noProgressCount = allRows.filter((r) => r.is_active && r.tasks_submitted === 0).length
  const dailyReport = data?.daily_report ?? []

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500">
            {formatRange(rangeStart, rangeEnd)} · {submittedCount} contributors submitted this week
            {disabledCount > 0 && ` · ${disabledCount} disabled`}
          </p>
        </div>
        {noProgressCount > 0 && (
          <Link
            to="/leaderboard"
            className="flex items-center gap-2 rounded-full border border-status-danger-text/30 bg-status-danger-bg px-4 py-2 text-sm font-semibold text-status-danger-text hover:border-status-danger-text"
          >
            <span className="h-2 w-2 rounded-full bg-current" />
            {noProgressCount} with no progress
          </Link>
        )}
      </div>

      {isLoading && <div className="text-gray-400">Loading...</div>}

      {!isLoading && (
        <>
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

          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="border-b border-gray-200 px-5 py-4">
              <h2 className="text-sm font-semibold text-gray-900">Daily Submission Report</h2>
              <p className="mt-1 text-xs text-gray-500">Team activity for this week.</p>
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
