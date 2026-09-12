import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, supabase } from '../lib/api'
import { startOfWeek, toISODate, formatRange } from '../lib/week'
import type { DashboardSummary, Project } from '../types'
import { Avatar } from '../components/Avatar'
import { ProgressBar } from '../components/ProgressBar'
import { LineChart } from '../components/LineChart'
import { downloadCsv } from '../lib/csv'

type StatusFilter = 'all' | 'active' | 'disabled'
type ActivityFilter = 'all' | 'submitted' | 'no_submissions'

export function Dashboard() {
  const queryClient = useQueryClient()
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('week')
  const [anchorDate, setAnchorDate] = useState(() => new Date())

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
    queryKey: ['dashboard-summary', rangeStart, rangeEnd, viewMode, projectId],
    queryFn: async () =>
      (
        await api.get<DashboardSummary>('/dashboard/summary', {
          params: { range_start: rangeStart, range_end: rangeEnd, view: viewMode, project_id: projectId || undefined },
        })
      ).data,
  })

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ userId, isActive }: { userId: string; isActive: boolean }) =>
      api.patch(`/users/${userId}`, { is_active: isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] }),
  })

  // Weekly targets are configured per ISO week; edits apply to the week containing
  // whatever range is currently being viewed (matching the lookup api.ts's dashboard()
  // already does server-side).
  const targetWeekStartIso = useMemo(
    () => toISODate(startOfWeek(new Date(`${rangeStart}T00:00:00`))),
    [rangeStart],
  )

  const targetMutation = useMutation({
    mutationFn: async ({ userId, target }: { userId: string; target: number }) => {
      const { error } = await supabase
        .from('weekly_targets')
        .upsert({ user_id: userId, week_start: targetWeekStartIso, target }, { onConflict: 'user_id,week_start' })
      if (error) throw error
    },
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

  const viewLabel = viewMode === 'day' ? 'Day' : viewMode === 'week' ? 'Week' : 'Month'
  const periodPhrase = viewMode === 'day' ? 'today' : viewMode === 'week' ? 'this week' : 'this month'

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500">
            {submittedCount} contributors submitted {periodPhrase}
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

      <div className="mb-4 flex flex-wrap items-center gap-3">
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
          <option value="submitted">{`Submitted ${viewLabel === 'Day' ? 'Today' : `This ${viewLabel}`}`}</option>
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
        <button
          onClick={() =>
            downloadCsv(
              `dashboard-${rangeStart}-to-${rangeEnd}.csv`,
              rows.map((r) => ({
                name: r.name,
                cb_email: r.cb_email,
                tasks_submitted: r.tasks_submitted,
                target: r.weekly_target,
                progress_pct: Math.round(r.progress * 100),
                is_active: r.is_active,
              })),
            )
          }
          disabled={rows.length === 0}
          className="ml-auto rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Export CSV
        </button>
      </div>

      <div className="mb-6 overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Daily Submission Report</h2>
            <p className="mt-1 text-xs text-gray-500">Team activity for the selected {viewMode}.</p>
          </div>
          {viewMode !== 'day' && (
            <button
              type="button"
              onClick={() => setShowGraphs((visible) => !visible)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              {showGraphs ? 'Hide Graphs' : 'Show Graphs'}
            </button>
          )}
        </div>
        {viewMode !== 'day' && showGraphs && (
          <div className="grid grid-cols-1 gap-4 border-b border-gray-200 p-5 lg:grid-cols-2">
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
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

            <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
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
              <th className="px-5 py-3">{viewLabel} Target</th>
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
                  {allRows.length === 0 ? `No activity for ${periodPhrase}.` : 'No contributors match these filters.'}
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
                  <td className="px-5 py-3 text-gray-500">
                    {viewMode === 'week' ? (
                      <input
                        type="number"
                        min={0}
                        defaultValue={row.weekly_target}
                        key={`${row.user_id}-${row.weekly_target}`}
                        onBlur={(e) => {
                          const next = Number(e.target.value)
                          if (Number.isFinite(next) && next >= 0 && next !== row.weekly_target) {
                            targetMutation.mutate({ userId: row.user_id, target: next })
                          }
                        }}
                        className="w-16 rounded-lg border border-gray-200 px-2 py-1 text-sm outline-none focus:border-accent"
                      />
                    ) : (
                      row.weekly_target
                    )}
                  </td>
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
