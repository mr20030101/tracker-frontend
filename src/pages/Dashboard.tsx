import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { CalendarDays, ChevronLeft, ChevronRight, ClipboardCheck, MessageCircle, Send, UserRoundX, Users } from 'lucide-react'
import { api, functionErrorMessage, supabase } from '../lib/api'
import { useAuth } from '../lib/auth'
import { downloadCsv } from '../lib/csv'
import { Select } from '../components/Select'
import { SegmentedTabs } from '../components/TableToolbar'
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, yearMonth, toISODate, formatRange } from '../lib/week'
import { useMessaging } from '../lib/messagingContext'
import type { DashboardSummary } from '../types'
import { LineChart } from '../components/LineChart'
import { DashboardHero } from '../components/DashboardHero'
import { OVERDUE_HOURS, fetchOverdueRequestCount } from '../lib/taskRequests'
import { usePageTitle } from '../lib/usePageTitle'

type ExportKind = 'daily' | 'contributors' | 'projects' | 'leads'

export function Dashboard() {
  usePageTitle('Dashboard')
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('week')
  const [anchorDate, setAnchorDate] = useState(() => new Date())
  const { usersById, myId, openChatWith, messagingEnabled } = useMessaging()
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
    refetchInterval: 5 * 60_000,
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
  const activeRows = allRows.filter((r) => r.is_active)
  const tasksSubmitted = activeRows.reduce((sum, r) => sum + r.tasks_submitted, 0)
  const weeklyTarget = activeRows.reduce((sum, r) => sum + r.weekly_target, 0)
  const tasksLogged = dailyReport.reduce((sum, d) => sum + d.tasks_logged, 0)
  const share = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0)
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
        stats={[
          { value: tasksSubmitted, label: 'Tasks', icon: ClipboardCheck },
          { value: activeRows.length, label: 'Active', icon: Users },
          { value: noProgressCount, label: 'No progress', icon: UserRoundX },
        ]}
        meters={[
          { label: 'Submitted', pct: share(submittedCount, activeRows.length), tone: 'night', text: `${submittedCount} / ${activeRows.length}` },
          ...(viewMode === 'week'
            ? [{ label: 'Team target', pct: share(tasksSubmitted, weeklyTarget), tone: 'honey' as const }]
            : []),
          { label: 'Logged, then submitted', pct: share(tasksSubmitted, Math.max(tasksLogged, tasksSubmitted)), tone: 'striped' },
          { label: 'No progress', pct: share(noProgressCount, activeRows.length), tone: 'outline' },
        ]}
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
                className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-gray-800 shadow-card hover:bg-gray-100"
              />
              {isAdmin && (
                <button
                  onClick={() => weeklyReportMutation.mutate()}
                  disabled={weeklyReportMutation.isPending}
                  title="Messages every lead a summary of last week (Tuesday–Monday), and every admin an all-teams overview."
                  className="inline-flex items-center gap-1.5 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-gray-800 shadow-card hover:bg-gray-100 disabled:opacity-50"
                >
                  <Send className="h-4 w-4" aria-hidden />
                  {weeklyReportMutation.isPending ? 'Sending...' : 'Send weekly report'}
                </button>
              )}
              {overdueRequests > 0 && (
                <Link
                  to="/requests"
                  title={`Pending for more than ${OVERDUE_HOURS} hours`}
                  className="flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-ink-foreground hover:bg-ink/90"
                >
                  <span className="h-2 w-2 rounded-full bg-current" />
                  {overdueRequests} overdue request{overdueRequests === 1 ? '' : 's'}
                </Link>
              )}
              {admin && messagingEnabled && (
                <button
                  onClick={() => openChatWith(admin.id, admin.name)}
                  className="flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-gray-800 shadow-card hover:bg-gray-100"
                >
                  <MessageCircle className="h-4 w-4" />
                  Message {admin.name}
                </button>
              )}
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
        <SegmentedTabs
          aria-label="Period"
          value={viewMode}
          onChange={setViewMode}
          options={(['day', 'week', 'month'] as const).map((mode) => ({ value: mode, label: mode[0].toUpperCase() + mode.slice(1) }))}
        />

        <button
          onClick={() => shiftRange(-1)}
          className="inline-flex h-10 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-100 pointer-coarse:h-11"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Prev
        </button>
        <div className="min-w-48 px-2 text-center font-display text-lg text-gray-900">
          {rangeLabel()}
        </div>
        <button
          onClick={() => shiftRange(1)}
          className="inline-flex h-10 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-100 pointer-coarse:h-11"
        >
          Next
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
        {!isCurrentRange && (
          <button
            onClick={() => setAnchorDate(new Date())}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-sky-700 hover:underline"
          >
            <CalendarDays className="h-4 w-4" aria-hidden />
            Back to {periodPhrase}
          </button>
        )}
      </div>

      {isLoading && <div className="text-gray-400">Loading...</div>}

      {!isLoading && (
        <>
          {viewMode !== 'day' && (
            <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="card p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="font-display text-lg text-gray-900">Submitted tasks by day</h3>
                  <span className="text-xs text-gray-400">tasks</span>
                </div>
                <LineChart
                  data={dailyReport.map((day) => ({ date: day.date, value: day.tasks_submitted }))}
                  color="#e0a91f"
                  unitLabel="submitted tasks"
                />
              </div>

              <div className="card p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="font-display text-lg text-gray-900">Contributors active by day</h3>
                  <span className="text-xs text-gray-400">contributors</span>
                </div>
                <LineChart
                  data={dailyReport.map((day) => ({ date: day.date, value: day.contributors_submitted }))}
                  color="ink"
                  unitLabel="contributors submitted"
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
