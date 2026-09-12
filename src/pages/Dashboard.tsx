import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { startOfWeek, toISODate, formatRange } from '../lib/week'
import type { DashboardSummary, Project } from '../types'
import { Avatar } from '../components/Avatar'
import { ProgressBar } from '../components/ProgressBar'

type StatusFilter = 'all' | 'active' | 'disabled'
type ActivityFilter = 'all' | 'submitted' | 'no_submissions'

export function Dashboard() {
  const queryClient = useQueryClient()
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const weekStartIso = useMemo(() => toISODate(weekStart), [weekStart])
  const thisWeekIso = useMemo(() => toISODate(startOfWeek(new Date())), [])
  const isCurrentWeek = weekStartIso === thisWeekIso

  const [search, setSearch] = useState('')
  const [projectId, setProjectId] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all')
  const [showGraphs, setShowGraphs] = useState(false)

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => (await api.get<Project[]>('/projects')).data,
  })

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-summary', weekStartIso, projectId],
    queryFn: async () =>
      (
        await api.get<DashboardSummary>('/dashboard/summary', {
          params: { week_start: weekStartIso, project_id: projectId || undefined },
        })
      ).data,
  })

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ userId, isActive }: { userId: string; isActive: boolean }) =>
      api.patch(`/users/${userId}`, { is_active: isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] }),
  })

  const allRows = data?.data ?? []
  const rows = allRows
    .filter((row) => {
      const matchesSearch =
        !search ||
        row.name.toLowerCase().includes(search.toLowerCase()) ||
        row.cb_email.toLowerCase().includes(search.toLowerCase())
      const matchesStatus =
        statusFilter === 'all' || (statusFilter === 'active' ? row.is_active : !row.is_active)
      const matchesActivity =
        activityFilter === 'all' ||
        (activityFilter === 'submitted' ? row.tasks_submitted > 0 : row.tasks_submitted === 0)

      return matchesSearch && matchesStatus && matchesActivity
    })
    .sort((a, b) => {
      const aFlag = a.is_active && a.tasks_submitted === 0 ? 0 : 1
      const bFlag = b.is_active && b.tasks_submitted === 0 ? 0 : 1
      return aFlag - bFlag
    })

  const submittedCount = allRows.filter((r) => r.tasks_submitted > 0).length
  const disabledCount = allRows.filter((r) => !r.is_active).length
  const noProgressCount = allRows.filter((r) => r.is_active && r.tasks_submitted === 0).length
  const dailyReport = data?.daily_report ?? []
  const maxDailySubmissions = Math.max(1, ...dailyReport.map((day) => day.tasks_submitted))
  const maxDailyContributors = Math.max(1, ...dailyReport.map((day) => day.contributors_submitted))

  function shiftWeek(days: number) {
    setWeekStart((prev) => {
      const next = new Date(prev)
      next.setDate(next.getDate() + days)
      return next
    })
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500">
            {submittedCount} contributors submitted this week
            {disabledCount > 0 && ` · ${disabledCount} disabled`}
          </p>
        </div>
        {noProgressCount > 0 && (
          <button
            onClick={() => setActivityFilter(activityFilter === 'no_submissions' ? 'all' : 'no_submissions')}
            className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${activityFilter === 'no_submissions'
              ? 'border-status-danger-text bg-status-danger-text text-white'
              : 'border-status-danger-text/30 bg-status-danger-bg text-status-danger-text hover:border-status-danger-text'
              }`}
          >
            <span className="h-2 w-2 rounded-full bg-current" />
            {noProgressCount} with no progress
          </button>
        )}
      </div>

      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={() => shiftWeek(-7)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          ← Prev Week
        </button>
        <div className="min-w-48 rounded-lg border border-gray-200 bg-white px-4 py-2 text-center text-sm font-medium text-gray-700">
          {data ? formatRange(data.week_start, data.week_end) : '...'}
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
        <input
          type="date"
          value={weekStartIso}
          onChange={(e) => {
            if (e.target.value) setWeekStart(startOfWeek(new Date(`${e.target.value}T00:00:00`)))
          }}
          className="ml-auto rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="search"
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent"
        >
          <option value="">All Projects</option>
          {projects?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          value={activityFilter}
          onChange={(e) => setActivityFilter(e.target.value as ActivityFilter)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent"
        >
          <option value="all">All Activity</option>
          <option value="submitted">Submitted This Week</option>
          <option value="no_submissions">No Submissions</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent"
        >
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="disabled">Disabled</option>
        </select>
        {(search || projectId || statusFilter !== 'all' || activityFilter !== 'all') && (
          <button
            onClick={() => {
              setSearch('')
              setProjectId('')
              setStatusFilter('all')
              setActivityFilter('all')
            }}
            className="text-sm font-medium text-sky-700 hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="mb-6 overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Daily Submission Report</h2>
            <p className="mt-1 text-xs text-gray-500">Team activity for the selected week.</p>
          </div>
          <button
            type="button"
            onClick={() => setShowGraphs((visible) => !visible)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            {showGraphs ? 'Hide Graphs' : 'Show Graphs'}
          </button>
        </div>
        {showGraphs && <div className="grid grid-cols-1 gap-4 border-b border-gray-200 p-5 lg:grid-cols-2">
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">Submitted Tasks by Day</h3>
              <span className="text-xs text-gray-400">tasks</span>
            </div>
            <div className="flex h-40 items-end gap-2 sm:gap-4">
              {dailyReport.map((day) => {
                const height = Math.max(8, (day.tasks_submitted / maxDailySubmissions) * 100)
                return (
                  <div key={day.date} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                    <span className="text-xs font-semibold text-gray-600">{day.tasks_submitted}</span>
                    <div className="flex h-28 w-full items-end">
                      <div
                        className="w-full rounded-t-md bg-accent transition-all"
                        style={{ height: `${height}%` }}
                        title={`${day.date}: ${day.tasks_submitted} submitted tasks`}
                      />
                    </div>
                    <span className="text-[10px] text-gray-400">{day.date.slice(5)}</span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">Contributors Active by Day</h3>
              <span className="text-xs text-gray-400">contributors</span>
            </div>
            <div className="flex h-40 items-end gap-2 sm:gap-4">
              {dailyReport.map((day) => {
                const height = Math.max(8, (day.contributors_submitted / maxDailyContributors) * 100)
                return (
                  <div key={day.date} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                    <span className="text-xs font-semibold text-gray-600">{day.contributors_submitted}</span>
                    <div className="flex h-28 w-full items-end">
                      <div
                        className="w-full rounded-t-md bg-sky-600 transition-all"
                        style={{ height: `${height}%` }}
                        title={`${day.date}: ${day.contributors_submitted} contributors submitted`}
                      />
                    </div>
                    <span className="text-[10px] text-gray-400">{day.date.slice(5)}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>}
        <div className="overflow-x-auto">
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
              {data?.daily_report.map((day) => (
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

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
            <tr>
              <th className="px-5 py-3">Contributor</th>
              <th className="px-5 py-3">Tasks Submitted</th>
              <th className="px-5 py-3">Weekly Target</th>
              <th className="px-5 py-3">Progress</th>
              <th className="px-5 py-3">Account Status</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-5 py-6 text-center text-gray-400">
                  Loading...
                </td>
              </tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-6 text-center text-gray-400">
                  {allRows.length === 0 ? 'No activity for this week.' : 'No contributors match these filters.'}
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const noProgress = row.is_active && row.tasks_submitted === 0

              return (
                <tr
                  key={row.cb_email}
                  className={`hover:bg-gray-50 ${!row.is_active ? 'opacity-60' : ''} ${noProgress ? 'bg-status-danger-bg/40' : ''
                    }`}
                >
                  <td className="px-5 py-3">
                    <Link
                      to={`/contributors/${encodeURIComponent(row.cb_email)}`}
                      className="flex items-center gap-3 hover:underline"
                    >
                      <Avatar name={row.name || row.cb_email} />
                      <div className="min-w-0">
                        <div className="truncate font-medium text-gray-900">{row.name}</div>
                        <div className="truncate text-xs text-gray-400">{row.cb_email}</div>
                      </div>
                    </Link>
                  </td>
                  <td className="px-5 py-3 font-medium">{row.tasks_submitted}</td>
                  <td className="px-5 py-3 text-gray-500">{row.weekly_target}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <ProgressBar value={row.progress} />
                      {noProgress && (
                        <span className="inline-flex items-center rounded-full bg-status-danger-text px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                          No Progress
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${row.is_active
                        ? 'bg-status-success-bg text-status-success-text'
                        : 'bg-status-danger-bg text-status-danger-text'
                        }`}
                    >
                      {row.is_active ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => toggleActiveMutation.mutate({ userId: row.user_id, isActive: !row.is_active })}
                      className={`text-xs font-medium hover:underline ${row.is_active ? 'text-status-danger-text' : 'text-sky-700'
                        }`}
                    >
                      {row.is_active ? 'Disable' : 'Enable'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
