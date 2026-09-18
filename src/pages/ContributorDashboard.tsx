import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { startOfWeek, toISODate } from '../lib/week'
import type { ContributorProfile } from '../types'
import { ProgressRing } from '../components/ProgressRing'
import { LineChart } from '../components/LineChart'

const TREND_DAYS = 30

export function ContributorDashboard() {
  const { user } = useAuth()
  const email = user?.email ?? ''
  const thisWeekIso = useMemo(() => toISODate(startOfWeek(new Date())), [])
  const today = useMemo(() => toISODate(new Date()), [])

  const { data, isLoading } = useQuery({
    queryKey: ['contributor', email, thisWeekIso],
    queryFn: async () =>
      (
        await api.get<ContributorProfile>('/contributor', {
          params: { email, week_start: thisWeekIso },
        })
      ).data,
    enabled: Boolean(email),
  })

  if (isLoading || !data) {
    return <div className="text-gray-400">Loading...</div>
  }

  const submittedToday = data.all_submissions.filter((r) => r.date?.slice(0, 10) === today && r.status === 'submitted').length
  const loggedToday = data.all_submissions.filter((r) => r.date?.slice(0, 10) === today).length
  const dayTarget = Math.round(data.weekly_target / 5)
  const dayProgress = dayTarget > 0 ? submittedToday / dayTarget : 0

  const stages = Object.entries(data.stage_breakdown) as [string, number][]
  const maxStageTotal = Math.max(1, ...stages.map(([, total]) => total))
  const maxProjectTotal = Math.max(1, ...data.project_breakdown.map((p) => p.total))

  const trendData = Array.from({ length: TREND_DAYS }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() - (TREND_DAYS - 1 - i))
    const iso = toISODate(d)
    const value = data.all_submissions.filter((r) => r.date?.slice(0, 10) === iso && r.status === 'submitted').length
    return { date: iso, value }
  })

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500">Welcome back, {data.user?.name ?? email}.</p>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex items-center gap-5 rounded-xl border border-gray-200 bg-white p-5 lg:col-span-1">
          <ProgressRing value={dayProgress} label="Day Goal" sublabel={`${submittedToday} / ${dayTarget}`} />
          <div className="flex flex-col gap-3">
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-gray-400">Submitted (Day)</div>
              <div className="text-xl font-bold text-gray-900">{submittedToday}</div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-gray-400">Logged (Day)</div>
              <div className="text-xl font-bold text-gray-900">{loggedToday}</div>
            </div>
            <div className="text-xs text-gray-400">Minimum goal — submit as much as you want, no upper limit.</div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold text-gray-700">Submission Trend</div>
            <span className="text-xs text-gray-400">last {TREND_DAYS} days</span>
          </div>
          <LineChart data={trendData} color="#d4a017" unitLabel="submitted" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="mb-3 text-sm font-semibold text-gray-700">By Stage (all-time)</div>
          <div className="flex flex-col gap-3">
            {stages.length === 0 && <div className="text-sm text-gray-400">No submissions yet.</div>}
            {stages.map(([stage, total]) => (
              <div key={stage} className="flex items-center gap-3 text-sm">
                <span className="w-16 shrink-0 uppercase text-gray-600">{stage}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${Math.max(4, (total / maxStageTotal) * 100)}%` }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right font-medium text-gray-900">{total}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="mb-3 text-sm font-semibold text-gray-700">By Project (all-time)</div>
          <div className="flex flex-col gap-3">
            {data.project_breakdown.length === 0 && <div className="text-sm text-gray-400">No submissions yet.</div>}
            {data.project_breakdown.map((p) => (
              <div key={p.name} className="flex items-center gap-3 text-sm">
                <span className="w-32 shrink-0 truncate text-gray-600" title={p.name}>
                  {p.name}
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-sky-600"
                    style={{ width: `${Math.max(4, (p.total / maxProjectTotal) * 100)}%` }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right font-medium text-gray-900">{p.total}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
