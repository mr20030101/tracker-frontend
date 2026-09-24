import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, supabase } from '../lib/api'
import { useAuth } from '../lib/auth'
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, yearMonth, toISODate, formatRange } from '../lib/week'
import type { DashboardSummary, LeaderboardRow, Project } from '../types'
import { Avatar } from '../components/Avatar'
import { ProgressBar } from '../components/ProgressBar'
import { Select } from '../components/Select'
import { Reveal } from '../components/Reveal'
import { GrowBar } from '../components/GrowBar'
import { SortableHeader } from '../components/SortableHeader'
import { downloadCsv } from '../lib/csv'
import { contributorPath } from '../lib/urlRef'

type Period = 'week' | 'month' | 'all'
type StatusFilter = 'all' | 'active' | 'disabled'
type ActivityFilter = 'all' | 'submitted' | 'no_submissions'

const MEDALS = ['🥇', '🥈', '🥉']
const MANAGER_ROLES = ['admin', 'lead']

function rangeFor(period: Period): { start: string; end: string } {
  const today = new Date()
  if (period === 'week') {
    return { start: toISODate(startOfWeek(today)), end: toISODate(endOfWeek(today)) }
  }
  if (period === 'month') {
    return { start: toISODate(startOfMonth(today)), end: toISODate(endOfMonth(today)) }
  }
  return { start: '2000-01-01', end: toISODate(today) }
}

export function Leaderboard() {
  const { user } = useAuth()
  const isManager = Boolean(user && MANAGER_ROLES.includes(user.role))
  return isManager ? <ManagerLeaderboard /> : <ContributorLeaderboard />
}

function ContributorLeaderboard() {
  const { user } = useAuth()
  const [period, setPeriod] = useState<Period>('week')

  const { start, end } = useMemo(() => rangeFor(period), [period])

  const { data, isLoading } = useQuery({
    queryKey: ['leaderboard', start, end],
    queryFn: async () => (await api.get<LeaderboardRow[]>('/leaderboard', { params: { range_start: start, range_end: end } })).data,
  })

  const rows = data ?? []
  const topScore = rows[0]?.tasks_submitted ?? 0
  const periodLabel = period === 'week' ? 'this week' : period === 'month' ? 'this month' : 'all time'

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Leaderboard</h1>
        <p className="text-sm text-gray-500">See who on your team has submitted the most tasks {periodLabel}.</p>
      </div>

      <div className="mb-4 flex rounded-lg border border-gray-200 bg-white p-1 w-fit">
        {(['week', 'month', 'all'] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium ${period === p ? 'bg-accent text-accent-foreground' : 'text-gray-600'}`}
          >
            {p === 'week' ? 'This Week' : p === 'month' ? 'This Month' : 'All Time'}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {isLoading && <div className="px-5 py-6 text-center text-gray-400">Loading...</div>}
        {!isLoading && rows.length === 0 && (
          <div className="px-5 py-6 text-center text-gray-400">No submissions {periodLabel} yet.</div>
        )}
        {!isLoading && rows.length > 0 && (
          <Reveal as="ul" className="divide-y divide-gray-100" step={45}>
            {rows.map((row, index) => {
              const isMe = row.user_id === user?.id
              const barPct = topScore ? Math.round((row.tasks_submitted / topScore) * 100) : 0

              return (
                <li key={row.user_id}>
                  <Link
                    to={contributorPath(row.cb_email)}
                    className={`flex items-center gap-3 px-5 py-3 hover:bg-gray-50 ${isMe ? 'bg-accent-bg/40' : ''}`}
                  >
                    <span className="w-8 shrink-0 text-center text-lg font-semibold text-gray-400">
                      {MEDALS[index] ?? index + 1}
                    </span>
                    <Avatar name={row.name} photoUrl={row.avatar_url} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-gray-900">
                        {row.name}
                        {isMe && <span className="ml-2 text-xs font-semibold text-accent">You</span>}
                      </div>
                      <div className="mt-1 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-gray-100">
                        <GrowBar className="h-full rounded-full bg-accent" pct={barPct} delay={300 + index * 45} />
                      </div>
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-gray-900">
                      {row.tasks_submitted} <span className="font-normal text-gray-400">tasks</span>
                    </span>
                  </Link>
                </li>
              )
            })}
          </Reveal>
        )}
      </div>
    </div>
  )
}

function ManagerLeaderboard() {
  const queryClient = useQueryClient()
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('week')
  const [anchorDate, setAnchorDate] = useState(() => new Date())

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

  const [search, setSearch] = useState('')
  const [projectId, setProjectId] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all')
  const [progressSort, setProgressSort] = useState<'asc' | 'desc'>('desc')

  function toggleProgressSort() {
    setProgressSort((prev) => (prev === 'desc' ? 'asc' : 'desc'))
  }

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

  // Weekly targets are keyed by the week's Tuesday start; edits apply to the week containing
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
    .sort((a, b) => (progressSort === 'desc' ? b.progress - a.progress : a.progress - b.progress))

  const viewLabel = viewMode === 'day' ? 'Day' : viewMode === 'week' ? 'Week' : 'Month'
  const periodPhrase = viewMode === 'day' ? 'today' : viewMode === 'week' ? 'this week' : 'this month'

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Leaderboard</h1>
        <p className="text-sm text-gray-500">Filter, sort, and manage contributor progress.</p>
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
        <Select
          value={projectId}
          onChange={setProjectId}
          options={[{ value: '', label: 'All Projects' }, ...(projects ?? []).map((p) => ({ value: String(p.id), label: p.name }))]}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <Select
          value={activityFilter}
          onChange={(value) => setActivityFilter(value as ActivityFilter)}
          options={[
            { value: 'all', label: 'All Activity' },
            { value: 'submitted', label: `Submitted ${viewLabel === 'Day' ? 'Today' : `This ${viewLabel}`}` },
            { value: 'no_submissions', label: 'No Submissions' },
          ]}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <Select
          value={statusFilter}
          onChange={(value) => setStatusFilter(value as StatusFilter)}
          options={[
            { value: 'all', label: 'All Statuses' },
            { value: 'active', label: 'Active' },
            { value: 'disabled', label: 'Disabled' },
          ]}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent"
        />
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
              `leaderboard-${rangeStart}-to-${rangeEnd}.csv`,
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

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
            <tr>
              <th className="px-5 py-3">Contributor</th>
              <th className="px-5 py-3">Tasks Submitted</th>
              <th className="px-5 py-3">{viewLabel} Target</th>
              <SortableHeader label="Progress" active dir={progressSort} onClick={toggleProgressSort} />
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
                  className={`hover:bg-gray-50 ${!row.is_active ? 'opacity-60' : ''} ${noProgress ? 'bg-status-danger-bg' : ''
                    }`}
                >
                  <td className="px-5 py-3">
                    <Link
                      to={contributorPath(row.cb_email)}
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
                    <ProgressBar value={row.progress} danger={noProgress} />
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
