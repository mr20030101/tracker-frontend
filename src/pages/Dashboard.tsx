import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Coffee, MessageCircle } from 'lucide-react'
import { api, functionErrorMessage, supabase } from '../lib/api'
import { useAuth } from '../lib/auth'
import { downloadCsv } from '../lib/csv'
import { Select } from '../components/Select'
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, yearMonth, toISODate, formatRange } from '../lib/week'
import { useMessaging } from '../lib/messagingContext'
import type { DashboardSummary } from '../types'
import { LineChart } from '../components/LineChart'
import { DashboardHero } from '../components/DashboardHero'
import { OVERDUE_HOURS, fetchOverdueRequestCount } from '../lib/taskRequests'

type ExportKind = 'daily' | 'contributors' | 'projects' | 'leads'

export function Dashboard() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
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

  // Same key as the sidebar's count, so both read one request.
  const { data: overdueRequests = 0 } = useQuery({
    queryKey: ['task-requests', 'overdue-count'],
    queryFn: fetchOverdueRequestCount,
    refetchInterval: 60_000,
  })
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

  function exportCsv(kind: ExportKind) {
    if (!data) return
    const suffix = `${rangeStart}-to-${rangeEnd}.csv`
    if (kind === 'daily') {
      downloadCsv(`daily-report-${suffix}`, dailyReport.map((day) => ({ ...day })))
    } else if (kind === 'contributors') {
      downloadCsv(
        `contributors-${suffix}`,
        allRows.map((r) => ({
          name: r.name,
          cb_email: r.cb_email,
          lead: (r.lead_id && usersById.get(r.lead_id)?.name) || '',
          tasks_submitted: r.tasks_submitted,
          target: r.weekly_target,
          progress_pct: Math.round(r.progress * 100),
          is_active: r.is_active,
        })),
      )
    } else if (kind === 'projects') {
      downloadCsv(
        `projects-${suffix}`,
        data.project_report.map((p) => ({
          project: p.name,
          tasks_submitted: p.tasks_submitted,
          tasks_logged: p.tasks_logged,
          contributors_submitted: p.contributors_submitted,
        })),
      )
    } else {
      // One row per lead (and one for contributors without a lead), summing their team.
      const teams = new Map<string, typeof allRows>()
      for (const row of allRows) {
        const key = row.lead_id ?? ''
        teams.set(key, [...(teams.get(key) ?? []), row])
      }
      downloadCsv(
        `teams-${suffix}`,
        [...teams.entries()]
          .map(([leadId, team]) => {
            const active = team.filter((r) => r.is_active)
            const submitted = team.reduce((sum, r) => sum + r.tasks_submitted, 0)
            const target = active.reduce((sum, r) => sum + r.weekly_target, 0)
            return {
              lead: leadId ? (usersById.get(leadId)?.name ?? 'Unknown lead') : 'No lead',
              contributors: active.length,
              tasks_submitted: submitted,
              combined_target: target,
              progress_pct: target ? Math.round((submitted / target) * 100) : 0,
              contributors_on_target: active.filter((r) => r.progress >= 1).length,
              contributors_with_no_submissions: active.filter((r) => r.tasks_submitted === 0).length,
            }
          })
          .sort((a, b) => b.tasks_submitted - a.tasks_submitted),
      )
    }
  }

  const weeklyReportMutation = useMutation({
    mutationFn: async () => {
      const { data: result, error } = await supabase.functions.invoke<{ sent: number; week_start: string; week_end: string }>(
        'daily-digest',
        { body: { mode: 'weekly' } },
      )
      if (error) throw await functionErrorMessage(error)
      return result!
    },
  })

  return (
    <div>
      <DashboardHero
        subtitle={
          <>
                {formatRange(rangeStart, rangeEnd)} · {submittedCount} contributors submitted {periodPhrase}
                {disabledCount > 0 && ` · ${disabledCount} disabled`}
          </>
        }
        actions={
          <>
              <Select
                value=""
                onChange={(value) => exportCsv(value as ExportKind)}
                placeholder="Export CSV..."
                disabled={!data}
                options={[
                  { value: 'daily', label: 'Daily report' },
                  { value: 'contributors', label: 'By contributor' },
                  { value: 'projects', label: 'By project' },
                  ...(isAdmin ? [{ value: 'leads', label: 'By team (lead)' }] : []),
                ]}
                className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              />
              {isAdmin && (
                <button
                  onClick={() => weeklyReportMutation.mutate()}
                  disabled={weeklyReportMutation.isPending}
                  title="Messages every lead a summary of last week (Tuesday–Monday), and every admin an all-teams overview."
                  className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {weeklyReportMutation.isPending ? 'Sending...' : 'Send weekly report'}
                </button>
              )}
              {noProgressCount > 0 && (
                <Link
                  to="/leaderboard"
                  className="flex items-center gap-2 rounded-full border border-status-danger-text/30 bg-status-danger-bg px-4 py-2 text-sm font-semibold text-status-danger-text hover:border-status-danger-text"
                >
                  <span className="h-2 w-2 rounded-full bg-current" />
                  {noProgressCount} with no progress
                </Link>
              )}
              {overdueRequests > 0 && (
                <Link
                  to="/requests"
                  title={`Pending for more than ${OVERDUE_HOURS} hours`}
                  className="flex items-center gap-2 rounded-full border border-status-danger-text/30 bg-status-danger-bg px-4 py-2 text-sm font-semibold text-status-danger-text hover:border-status-danger-text"
                >
                  <span className="h-2 w-2 rounded-full bg-current" />
                  {overdueRequests} overdue request{overdueRequests === 1 ? '' : 's'}
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
              {/* New tab: the donate page is public and has no app navigation to come back by. */}
              <a
                href="/donate"
                target="_blank"
                rel="noopener"
                className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Buy me a cup of coffee
                <Coffee className="h-4 w-4 text-accent" />
              </a>
          </>
        }
      />

      {weeklyReportMutation.isSuccess && (
        <div className="mb-4 rounded-lg bg-status-success-bg px-4 py-2 text-sm text-status-success-text">
          Weekly report for {formatRange(weeklyReportMutation.data.week_start, weeklyReportMutation.data.week_end)} sent to{' '}
          {weeklyReportMutation.data.sent} {weeklyReportMutation.data.sent === 1 ? 'person' : 'people'} in Messages.
        </div>
      )}
      {weeklyReportMutation.isError && (
        <div className="mb-4 rounded-lg bg-status-danger-bg px-4 py-2 text-sm text-status-danger-text">
          {(weeklyReportMutation.error as Error).message}
        </div>
      )}

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
