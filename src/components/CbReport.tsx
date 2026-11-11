import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { api, supabase } from '../lib/api'
import { CONTRIBUTOR_HOURS, HOURS_LABELS } from '../lib/attendance'
import { fetchAssignments, fetchProjectLeads } from '../lib/cbProjects'
import { downloadCsv } from '../lib/csv'
import { dailyHoursFor, formatHours, hoursRendered } from '../lib/hoursTarget'
import { endOfMonth, endOfWeek, fromISODate, startOfMonth, startOfWeek, toISODate } from '../lib/week'
import type { AttendanceHours, Project } from '../types'
import { SegmentedTabs } from './TableToolbar'

type Period = 'today' | 'week' | 'last-week' | 'month'

const PERIODS: { value: Period; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'last-week', label: 'Last week' },
  { value: 'month', label: 'This month' },
]

function rangeOf(period: Period): { start: string; end: string } {
  const now = new Date()
  if (period === 'today') return { start: toISODate(now), end: toISODate(now) }
  if (period === 'month') return { start: toISODate(startOfMonth(now)), end: toISODate(endOfMonth(now)) }
  const base = period === 'last-week' ? new Date(startOfWeek(now).getTime() - 86_400_000) : now
  return { start: toISODate(startOfWeek(base)), end: toISODate(endOfWeek(base)) }
}

/** Every date from start to end, newest first, not past today. */
function daysOf(start: string, end: string): string[] {
  const today = toISODate(new Date())
  const last = end < today ? end : today
  const days: string[] = []
  for (let d = fromISODate(last); toISODate(d) >= start; d = new Date(d.getTime() - 86_400_000)) days.push(toISODate(d))
  return days
}

const dayLabel = (iso: string) => fromISODate(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })

interface TaskRow {
  date: string | null
  status: string
  timer_elapsed_seconds: number | null
  timer_started_at: string | null
}

interface AttendanceRow {
  date: string
  hours: AttendanceHours
}

/**
 * A lead's or admin's report on one contributor for a week or month: attendance, submissions and
 * hours rendered as three plain numbers, then one line per day. Loads only that period.
 */
export function CbReport({ userId, email, leadId, name }: { userId: string; email: string; leadId: string | null; name: string }) {
  const [period, setPeriod] = useState<Period>('week')
  const { start, end } = useMemo(() => rangeOf(period), [period])

  const { data: tasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ['cb-report', 'tasks', email, start, end],
    queryFn: async () => {
      const pattern = email.replace(/[\\%_]/g, (c) => `\\${c}`)
      const { data, error } = await supabase
        .from('task_submissions')
        .select('date, status, timer_elapsed_seconds, timer_started_at')
        .ilike('cb_email', pattern)
        .gte('date', start)
        .lte('date', end)
        .limit(5000)
      if (error) throw error
      return data as TaskRow[]
    },
  })
  const { data: attendance = [], isLoading: attendanceLoading } = useQuery({
    queryKey: ['cb-report', 'attendance', userId, start, end],
    queryFn: async () => {
      const { data, error } = await supabase.from('attendance').select('date, hours').eq('user_id', userId).gte('date', start).lte('date', end)
      if (error) throw error
      return data as AttendanceRow[]
    },
  })
  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: async () => (await api.get<Project[]>('/projects')).data })
  const { data: projectLeads = [] } = useQuery({ queryKey: ['project-leads', 'all'], queryFn: fetchProjectLeads })
  const { data: assignments = [] } = useQuery({ queryKey: ['cb-project-assignments', userId], queryFn: () => fetchAssignments([userId]) })

  const days = daysOf(start, end)
  const attendanceByDay = new Map(attendance.map((a) => [a.date.slice(0, 10), a]))
  const tasksOn = (day: string) => tasks.filter((t) => t.date?.slice(0, 10) === day)

  const presentDays = days.filter((d) => {
    const entry = attendanceByDay.get(d)
    return entry && CONTRIBUTOR_HOURS.includes(entry.hours)
  }).length
  const submitted = tasks.filter((t) => t.status === 'submitted').length
  const rejected = tasks.filter((t) => t.status === 'rejected').length
  const expired = tasks.filter((t) => t.status === 'expired').length
  const hours = hoursRendered(tasks.map((t) => ({ timer_elapsed_seconds: t.timer_elapsed_seconds ?? 0, timer_started_at: t.timer_started_at })))
  const goal = dailyHoursFor(userId, leadId, projects, projectLeads, assignments) * presentDays
  const loading = tasksLoading || attendanceLoading

  const rows = days.map((day) => {
    const entry = attendanceByDay.get(day)
    const dayTasks = tasksOn(day)
    return {
      day,
      attendance: entry ? HOURS_LABELS[entry.hours] : 'Not filed',
      filed: Boolean(entry),
      submitted: dayTasks.filter((t) => t.status === 'submitted').length,
      hours: hoursRendered(dayTasks.map((t) => ({ timer_elapsed_seconds: t.timer_elapsed_seconds ?? 0, timer_started_at: t.timer_started_at }))),
    }
  })

  function exportCsv() {
    downloadCsv(
      `report-${email}-${start}-to-${end}.csv`,
      rows.map((r) => ({ date: r.day, attendance: r.attendance, tasks_submitted: r.submitted, hours_rendered: Number(r.hours.toFixed(2)) })),
    )
  }

  return (
    <section className="mb-6 card p-5" aria-label={`Report for ${name}`}>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="font-display text-lg text-gray-900">Report</h2>
        <SegmentedTabs aria-label="Period" value={period} onChange={setPeriod} options={PERIODS} />
        <button
          type="button"
          onClick={exportCsv}
          disabled={loading}
          className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-full border border-gray-200 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <Download className="h-4 w-4" aria-hidden />
          Export CSV
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : (
        <>
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-gray-200 px-4 py-3">
              <dt className="text-xs text-gray-500">Attendance</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">
                {presentDays} <span className="text-base font-normal text-gray-500">of {days.length} days</span>
              </dd>
              <dd className="text-xs text-gray-500">{days.length - presentDays > 0 ? `${days.length - presentDays} missed or absent` : 'No days missed'}</dd>
            </div>
            <div className="rounded-lg border border-gray-200 px-4 py-3">
              <dt className="text-xs text-gray-500">Submitted</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">
                {submitted} <span className="text-base font-normal text-gray-500">{submitted === 1 ? 'task' : 'tasks'}</span>
              </dd>
              <dd className="text-xs text-gray-500">
                {rejected || expired ? [rejected && `${rejected} rejected`, expired && `${expired} expired`].filter(Boolean).join(' · ') : 'None rejected or expired'}
              </dd>
            </div>
            <div className="rounded-lg border border-gray-200 px-4 py-3">
              <dt className="text-xs text-gray-500">Hours rendered</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">
                {formatHours(hours)}
                {goal > 0 && <span className="text-base font-normal text-gray-500"> of {formatHours(goal)}</span>}
              </dd>
              <dd className="text-xs text-gray-500">{goal > 0 ? `${Math.round((hours / goal) * 100)}% of the goal for the days present` : 'No Hours / day set on their projects'}</dd>
            </div>
          </dl>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[28rem] text-left text-sm">
              <thead className="border-b border-gray-200 text-xs text-gray-500">
                <tr>
                  <th className="py-2 pr-4 font-medium">Day</th>
                  <th className="py-2 pr-4 font-medium">Attendance</th>
                  <th className="py-2 pr-4 text-right font-medium">Submitted</th>
                  <th className="py-2 text-right font-medium">Hours</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => (
                  <tr key={r.day}>
                    <td className="whitespace-nowrap py-2 pr-4 text-gray-700">{dayLabel(r.day)}</td>
                    <td className={`py-2 pr-4 ${r.filed ? 'text-gray-700' : 'text-status-danger-text'}`}>{r.attendance}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-gray-900">{r.submitted}</td>
                    <td className="py-2 text-right tabular-nums text-gray-900">{formatHours(r.hours)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}
