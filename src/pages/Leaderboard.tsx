import { Fragment, useMemo, useState } from 'react'
import { FoldText } from '../components/FoldText'
import { ChevronLeft, ChevronRight, Download, UserCheck, UserMinus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { TOP_PLACES, topWithMine } from '../lib/topPlaces'
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, yearMonth, toISODate, fromISODate, formatRange } from '../lib/week'
import type { DashboardSummary, LeaderboardRow, Project } from '../types'
import { Avatar } from '../components/Avatar'
import { ProgressBar } from '../components/ProgressBar'
import { formatHours } from '../lib/hoursTarget'
import { Select } from '../components/Select'
import { FilterAction, FilterBar, FilterField, SearchInput, SegmentedTabs, TableCard, toolbarControlClass } from '../components/TableToolbar'
import { Reveal } from '../components/Reveal'
import { GrowBar } from '../components/GrowBar'
import { SortableHeader } from '../components/SortableHeader'
import { downloadCsv } from '../lib/csv'
import { contributorPath, contributorPathById } from '../lib/urlRef'
import { FeaturedBadgeChip, StreakChip } from '../components/Achievements'
import { useAchievements, useFeaturedBadges } from '../lib/achievements'
import { LONG_CACHE } from '../lib/queryCache'
import { usePageTitle } from '../lib/usePageTitle'
import { mostImproved, rankWeek, teamGoal, useTeamWeeks, type TeamWeekRow } from '../lib/teamWeeks'

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
  usePageTitle('Leaderboard')
  const { user } = useAuth()
  const isManager = Boolean(user && MANAGER_ROLES.includes(user.role))
  return isManager ? <ManagerLeaderboard /> : <ContributorLeaderboard />
}

function YourPlaceDivider() {
  return (
    <li aria-hidden className="bg-gray-50 px-5 py-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400">
      Your place
    </li>
  )
}

function ContributorLeaderboard() {
  const { user } = useAuth()
  const [period, setPeriod] = useState<Period | 'improved'>('week')

  const { start, end } = useMemo(() => rangeFor(period === 'improved' ? 'week' : period), [period])

  const { data, isLoading } = useQuery({
    queryKey: ['leaderboard', start, end],
    queryFn: async () => (await api.get<LeaderboardRow[]>('/leaderboard', { params: { range_start: start, range_end: end } })).data,
    // Contributors get the board cached (lib/queryCache.ts): it doesn't need to be live for them.
    ...LONG_CACHE,
  })
  const { data: teamRows = [] } = useTeamWeeks(LONG_CACHE)
  const team = teamGoal(rankWeek(teamRows, start))

  const rows = data ?? []
  const topScore = rows[0]?.tasks_submitted ?? 0
  const { top, mine } = topWithMine(rows, (row) => row.user_id === user?.id)
  const shown = mine ? [...top, mine.item] : top
  const { data: achievements } = useAchievements(shown.map((r) => r.user_id), LONG_CACHE)
  const { data: featuredBadges } = useFeaturedBadges(shown.map((r) => r.user_id), LONG_CACHE)
  const periodLabel = period === 'week' ? 'this week' : period === 'month' ? 'this month' : 'all time'
  const teamPct = team.target > 0 ? Math.min(100, (team.submitted / team.target) * 100) : 0

  return (
    <div>
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-3xl font-medium sm:text-4xl text-gray-900">
          <FoldText text="Leaderboard" />
        </h1>
        <p className="text-sm text-gray-500">
          {period === 'improved'
            ? 'Who stepped up most: last week compared with each person’s average over the four weeks before.'
            : `The top ${TOP_PLACES} on your team by tasks submitted ${periodLabel}, and your place.`}
        </p>
      </div>

      {period === 'week' && team.target > 0 && (
        <div className="mb-4 card px-5 py-4">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="font-semibold text-gray-700">Team goal this week</span>
            <span className="font-semibold text-gray-900">
              {team.submitted.toLocaleString()} <span className="font-normal text-gray-400">/ {team.target.toLocaleString()}</span>
            </span>
          </div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-gray-100">
            <GrowBar className={`h-full rounded-full ${teamPct >= 100 ? 'bg-emerald-500' : 'bg-sky-500'}`} pct={teamPct} delay={200} />
          </div>
          <div className="mt-1.5 text-xs text-gray-500">
            {teamPct >= 100 ? 'Reached! Amazing work, everyone.' : 'Everyone’s targets added up. Every task anyone submits fills it.'}
          </div>
        </div>
      )}

      <div className="mb-4 max-w-full overflow-x-auto scrollbar-none">
        <SegmentedTabs
          aria-label="Period"
          value={period}
          onChange={setPeriod}
          options={(['week', 'month', 'all', 'improved'] as const).map((p) => ({
            value: p,
            label: p === 'week' ? 'This Week' : p === 'month' ? 'This Month' : p === 'all' ? 'All Time' : 'Most Improved',
          }))}
        />
      </div>

      {period === 'improved' ? (
        <MostImprovedList rows={teamRows} meId={user?.id} />
      ) : (
        <div className="overflow-hidden card">
          {isLoading && <div className="px-5 py-6 text-center text-gray-400">Loading...</div>}
          {!isLoading && rows.length === 0 && (
            <div className="px-5 py-6 text-center text-gray-400">No submissions {periodLabel} yet.</div>
          )}
          {!isLoading && rows.length > 0 && (
            <Reveal as="ul" className="divide-y divide-gray-100" step={45}>
              {[...top.map((row, index) => ({ row, index })), ...(mine ? [{ row: mine.item, index: mine.index }] : [])].map(({ row, index }) => {
                const isMe = row.user_id === user?.id
                const barPct = topScore ? Math.round((row.tasks_submitted / topScore) * 100) : 0

                return (
                  <Fragment key={row.user_id}>
                  {index >= TOP_PLACES && <YourPlaceDivider />}
                  <li>
                    <Link
                      to={contributorPathById(row.user_id)}
                      className={`flex items-center gap-3 px-5 py-3 hover:bg-gray-50 ${isMe ? 'bg-accent-bg/40' : ''}`}
                    >
                      <span className="w-8 shrink-0 text-center text-lg font-semibold text-gray-400">
                        {MEDALS[index] ?? index + 1}
                      </span>
                      <Avatar name={row.name} photoUrl={row.avatar_url} size={36} />
                      <div className="min-w-0 flex-1">
                        {/* Only the name is cut short: clipping the whole line would also cut off the streak's flame. */}
                        <div className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-gray-900">
                          <span className="mr-0.5 truncate">{row.name}</span>
                          <StreakChip streak={achievements?.get(row.user_id)?.current_streak} />
                          <FeaturedBadgeChip badgeId={featuredBadges?.get(row.user_id)} />
                          {isMe && <span className="ml-0.5 shrink-0 text-xs font-semibold text-accent-text">You</span>}
                        </div>
                        <div className="mt-1 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-gray-100">
                          <GrowBar className="h-full rounded-full bg-accent" pct={barPct} delay={300 + Math.min(index, TOP_PLACES) * 45} />
                        </div>
                      </div>
                      <span className="shrink-0 text-sm font-semibold text-gray-900">
                        {row.tasks_submitted} <span className="font-normal text-gray-400">tasks</span>
                      </span>
                    </Link>
                  </li>
                  </Fragment>
                )
              })}
            </Reveal>
          )}
        </div>
      )}
    </div>
  )
}

function MostImprovedList({ rows, meId }: { rows: TeamWeekRow[]; meId: string | undefined }) {
  const list = mostImproved(rows)
  const { top, mine } = topWithMine(list, ({ row }) => row.user_id === meId)
  const shown = [...top.map((item, index) => ({ item, index })), ...(mine ? [mine] : [])]
  if (list.length === 0) {
    return <div className="card px-5 py-6 text-center text-gray-400">Not enough weeks yet to compare.</div>
  }
  return (
    <div className="overflow-hidden card">
      <Reveal as="ul" className="divide-y divide-gray-100" step={45}>
        {shown.map(({ item: { row, average, change }, index }) => {
          const isMe = row.user_id === meId
          const up = Math.round(change)
          return (
            <Fragment key={row.user_id}>
            {index >= TOP_PLACES && <YourPlaceDivider />}
            <li>
              <Link
                to={contributorPathById(row.user_id)}
                className={`flex items-center gap-3 px-5 py-3 hover:bg-gray-50 ${isMe ? 'bg-accent-bg/40' : ''}`}
              >
                <span className="w-8 shrink-0 text-center text-lg font-semibold text-gray-400">{up > 0 ? (MEDALS[index] ?? index + 1) : index + 1}</span>
                <Avatar name={row.name} photoUrl={row.avatar_url} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-gray-900">
                    {row.name}
                    {isMe && <span className="ml-2 text-xs font-semibold text-accent-text">You</span>}
                  </div>
                  <div className="text-xs text-gray-400">
                    {row.submitted.toLocaleString()} last week · usually {Math.round(average).toLocaleString()}
                  </div>
                </div>
                <span className={`shrink-0 text-sm font-bold ${up > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                  {up > 0 ? `+${up.toLocaleString()}` : up.toLocaleString()}
                </span>
              </Link>
            </li>
            </Fragment>
          )
        })}
      </Reveal>
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
    .sort((a, b) => (progressSort === 'desc' ? b.hours_progress - a.hours_progress : a.hours_progress - b.hours_progress))
  const { data: achievements } = useAchievements(allRows.map((r) => r.user_id))
  const { data: featuredBadges } = useFeaturedBadges(allRows.map((r) => r.user_id))

  const viewLabel = viewMode === 'day' ? 'Day' : viewMode === 'week' ? 'Week' : 'Month'
  const periodPhrase = viewMode === 'day' ? 'today' : viewMode === 'week' ? 'this week' : 'this month'

  return (
    <div>
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-3xl font-medium sm:text-4xl text-gray-900">
          <FoldText text="Leaderboard" />
        </h1>
        <p className="text-sm text-gray-500">Filter, sort, and manage contributor progress.</p>
      </div>

      <TableCard
        toolbar={
          <FilterBar
            active={[!isCurrentRange, search, projectId, statusFilter !== 'all', activityFilter !== 'all'].filter(Boolean).length}
            onReset={() => {
              setAnchorDate(new Date())
              setSearch('')
              setProjectId('')
              setStatusFilter('all')
              setActivityFilter('all')
            }}
            actions={
              <FilterAction
                onClick={() =>
                  downloadCsv(
                  `leaderboard-${rangeStart}-to-${rangeEnd}.csv`,
                  rows.map((r) => ({
                    name: r.name,
                    cb_email: r.cb_email,
                    tasks_submitted: r.tasks_submitted,
                    hours_rendered: Number(r.hours_rendered.toFixed(2)),
                    target_hours: Number(r.hours_target.toFixed(2)),
                    progress_pct: Math.round(r.hours_progress * 100),
                    current_streak_weeks: achievements?.get(r.user_id)?.current_streak ?? 0,
                    is_active: r.is_active,
                  })),
                )
                }
                disabled={rows.length === 0}
              >
                <Download className="h-3.5 w-3.5" aria-hidden />
                Export CSV
              </FilterAction>
            }
          >
            <FilterField label="Period">
              <SegmentedTabs
                aria-label="Period"
                value={viewMode}
                onChange={setViewMode}
                options={[
                  { value: 'day', label: 'Day' },
                  { value: 'week', label: 'Week' },
                  { value: 'month', label: 'Month' },
                ]}
              />
            </FilterField>
            <FilterField label="Range">
              <div className="flex h-10 pointer-coarse:h-11 items-center rounded-full border border-gray-200 bg-white">
                <button
                  onClick={() => shiftRange(-1)}
                  aria-label="Previous period"
                  className="flex h-full items-center rounded-l-full pl-3 pr-2 text-gray-500 transition-colors duration-100 hover:bg-gray-50 hover:text-gray-800"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="min-w-0 flex-1 truncate text-center text-sm font-medium text-gray-700">{rangeLabel()}</span>
                <button
                  onClick={() => shiftRange(1)}
                  aria-label="Next period"
                  className="flex h-full items-center rounded-r-full pl-2 pr-3 text-gray-500 transition-colors duration-100 hover:bg-gray-50 hover:text-gray-800"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </FilterField>
            <FilterField label="Jump to date" id="leaderboard-date">
              <input
                id="leaderboard-date"
                type="date"
                value={toISODate(anchorDate)}
                onChange={(e) => {
                  if (e.target.value) setAnchorDate(fromISODate(e.target.value))
                }}
                className={toolbarControlClass}
              />
            </FilterField>
            <FilterField label="Search" id="leaderboard-search" set={Boolean(search)}>
              <SearchInput id="leaderboard-search" placeholder="Name or email" value={search} onChange={setSearch} />
            </FilterField>
            <FilterField label="Project" id="leaderboard-project" set={Boolean(projectId)}>
              <Select
                id="leaderboard-project"
                fullWidth
                value={projectId}
                onChange={setProjectId}
                options={[{ value: '', label: 'All Projects' }, ...(projects ?? []).map((p) => ({ value: String(p.id), label: p.name }))]}
                className={toolbarControlClass}
              />
            </FilterField>
            <FilterField label="Activity" id="leaderboard-activity" set={activityFilter !== 'all'}>
              <Select
                id="leaderboard-activity"
                fullWidth
                value={activityFilter}
                onChange={(value) => setActivityFilter(value as ActivityFilter)}
                options={[
                  { value: 'all', label: 'All Activity' },
                  { value: 'submitted', label: `Submitted ${viewLabel === 'Day' ? 'Today' : `This ${viewLabel}`}` },
                  { value: 'no_submissions', label: 'No Submissions' },
                ]}
                className={toolbarControlClass}
              />
            </FilterField>
            <FilterField label="Status" id="leaderboard-status" set={statusFilter !== 'all'}>
              <Select
                id="leaderboard-status"
                fullWidth
                value={statusFilter}
                onChange={(value) => setStatusFilter(value as StatusFilter)}
                options={[
                  { value: 'all', label: 'All Statuses' },
                  { value: 'active', label: 'Active' },
                  { value: 'disabled', label: 'Disabled' },
                ]}
                className={toolbarControlClass}
              />
            </FilterField>
          </FilterBar>
        }
      >
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
            <tr>
              <th className="px-5 py-3">Contributor</th>
              <th className="px-5 py-3">Tasks Submitted</th>
              <th className="px-5 py-3">Hours</th>
              <th className="px-5 py-3">{viewLabel} Target</th>
              <SortableHeader label="Progress" active dir={progressSort} onClick={toggleProgressSort} />
              <th className="px-5 py-3">Account Status</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && (
              <tr>
                <td colSpan={7} className="px-5 py-6 text-center text-gray-400">
                  Loading...
                </td>
              </tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-6 text-center text-gray-400">
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
                        <div className="flex min-w-0 items-center gap-2 font-medium text-gray-900">
                          <span className="truncate">{row.name}</span>
                          <StreakChip streak={achievements?.get(row.user_id)?.current_streak} />
                          <FeaturedBadgeChip badgeId={featuredBadges?.get(row.user_id)} />
                        </div>
                        <div className="truncate text-xs text-gray-400">{row.cb_email}</div>
                      </div>
                    </Link>
                  </td>
                  <td className="px-5 py-3 font-medium">{row.tasks_submitted}</td>
                  <td className="px-5 py-3 tabular-nums text-gray-900">{formatHours(row.hours_rendered)}</td>
                  {/* Hours / day on their projects (set on the Projects page), not edited here. */}
                  <td className="px-5 py-3 tabular-nums text-gray-500">
                    {row.hours_target > 0 ? formatHours(row.hours_target) : <span title="No Hours / day set on their projects">Not set</span>}
                  </td>
                  <td className="px-5 py-3">
                    <ProgressBar value={row.hours_progress} danger={noProgress} />
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
                      className={`inline-flex items-center gap-1.5 text-xs font-medium hover:underline ${row.is_active ? 'text-status-danger-text' : 'text-sky-700'
                        }`}
                    >
                      {row.is_active ? <UserMinus className="h-3.5 w-3.5" aria-hidden /> : <UserCheck className="h-3.5 w-3.5" aria-hidden />}
                      {row.is_active ? 'Disable' : 'Enable'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </TableCard>
    </div>
  )
}
