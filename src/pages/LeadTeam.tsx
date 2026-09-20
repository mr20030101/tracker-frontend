import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { api } from '../lib/api'
import { fetchLeadTeam, type TeamMember } from '../lib/leadTeam'
import { isOnline } from '../lib/presence'
import { startOfWeek, toISODate, formatRange } from '../lib/week'
import type { User } from '../types'
import { Avatar } from '../components/Avatar'
import { CountUp } from '../components/CountUp'
import { DataTable } from '../components/DataTable'
import { LineChart } from '../components/LineChart'
import { ProgressBar } from '../components/ProgressBar'
import { Select } from '../components/Select'

const percent = (n: number) => `${Math.round(n)}%`

function StatTile({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">{label}</div>
      <div className="mt-1 text-3xl font-bold text-gray-900">{children}</div>
      {hint && <div className="mt-1 text-xs text-gray-500">{hint}</div>}
    </div>
  )
}

export function LeadTeam() {
  const { leadId = '' } = useParams()
  const navigate = useNavigate()
  const [anchorDate, setAnchorDate] = useState(() => new Date())
  const weekStart = toISODate(startOfWeek(anchorDate))
  const isCurrentWeek = weekStart === toISODate(startOfWeek(new Date()))

  const { data: team, isLoading, error } = useQuery({
    queryKey: ['lead-team', leadId, weekStart],
    queryFn: () => fetchLeadTeam(leadId, weekStart),
    refetchInterval: 60_000,
  })

  // Same key as the Users page, so switching between leads reuses its cache.
  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: async () => (await api.get<User[]>('/users')).data,
  })
  const leadOptions = useMemo(() => {
    const leads = (users ?? []).filter((u) => u.role === 'lead' || u.id === leadId)
    return leads.map((lead) => ({ value: lead.id, label: lead.name }))
  }, [users, leadId])

  function shiftWeek(direction: 1 | -1) {
    setAnchorDate((prev) => {
      const next = new Date(prev)
      next.setDate(next.getDate() + direction * 7)
      return next
    })
  }

  const members = team?.members ?? []
  const activeMembers = members.filter((m) => m.user.is_active)
  const submitted = members.reduce((sum, m) => sum + m.submitted, 0)
  // Disabled members aren't expected to deliver, so they don't count toward the team's target.
  const activeTarget = activeMembers.reduce((sum, m) => sum + m.target, 0)
  const activeSubmitted = activeMembers.reduce((sum, m) => sum + m.submitted, 0)
  const teamProgress = activeTarget ? activeSubmitted / activeTarget : 0
  const noProgress = activeMembers.filter((m) => m.submitted === 0).length

  const columns = useMemo<ColumnDef<TeamMember, any>[]>(
    () => [
      {
        id: 'name',
        accessorFn: (m) => m.user.name,
        header: 'Member',
        cell: ({ row }) => {
          const u = row.original.user
          return (
            <Link to={`/contributors/${encodeURIComponent(u.email)}`} className="flex items-center gap-3 hover:underline">
              <Avatar name={u.name} photoUrl={u.avatar_url} size={28} />
              <div className="min-w-0">
                <div className="truncate font-medium text-gray-900">{u.name}</div>
                <div className="truncate text-xs text-gray-400">{u.email}</div>
              </div>
            </Link>
          )
        },
      },
      { id: 'submitted', accessorFn: (m) => m.submitted, header: 'Submitted', cell: ({ row }) => <span className="font-medium">{row.original.submitted}</span> },
      { id: 'logged', accessorFn: (m) => m.logged, header: 'Logged', cell: ({ row }) => <span className="text-gray-500">{row.original.logged}</span> },
      { id: 'target', accessorFn: (m) => m.target, header: 'Target', cell: ({ row }) => <span className="text-gray-500">{row.original.target}</span> },
      {
        id: 'progress',
        accessorFn: (m) => m.progress,
        header: 'Progress',
        cell: ({ row }) => (
          <ProgressBar value={row.original.progress} danger={row.original.user.is_active && row.original.submitted === 0} />
        ),
      },
      {
        id: 'status',
        accessorFn: (m) => Number(m.user.is_active),
        header: 'Status',
        cell: ({ row }) => {
          const active = row.original.user.is_active
          return (
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                active ? 'bg-status-success-bg text-status-success-text' : 'bg-status-danger-bg text-status-danger-text'
              }`}
            >
              {active ? 'Active' : 'Disabled'}
            </span>
          )
        },
      },
      {
        id: 'session',
        accessorFn: (m) => (m.user.last_seen_at ? new Date(m.user.last_seen_at).getTime() : 0),
        header: 'Session',
        cell: ({ row }) => {
          const online = isOnline(row.original.user.last_seen_at)
          return (
            <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
              <span className={`h-2 w-2 rounded-full ${online ? 'bg-status-success-text' : 'bg-gray-300'}`} />
              {online ? 'Online' : 'Offline'}
            </span>
          )
        },
      },
    ],
    [],
  )

  const backLink = (
    <Link to="/users" className="mb-4 inline-block text-sm font-medium text-sky-700 hover:underline">
      ← Back to Users
    </Link>
  )

  if (isLoading) return <div className="text-gray-400">Loading...</div>

  if (error) {
    return (
      <div>
        {backLink}
        <div role="alert" className="rounded-lg border border-status-danger-text/30 bg-status-danger-bg px-4 py-2.5 text-sm text-status-danger-text">
          {(error as Error).message || 'Could not load this team.'}
        </div>
      </div>
    )
  }

  if (!team) {
    return (
      <div>
        {backLink}
        <h1 className="text-2xl font-bold text-gray-900">Lead not found</h1>
        <p className="text-sm text-gray-500">No account matches this link. It may have been deleted.</p>
      </div>
    )
  }

  const { lead } = team
  const leadOnline = isOnline(lead.last_seen_at)

  return (
    <div>
      {backLink}

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar name={lead.name} photoUrl={lead.avatar_url} size={56} />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900">{lead.name}</h1>
              <span className="rounded-full bg-accent-bg px-2.5 py-0.5 text-xs font-semibold capitalize text-accent-foreground">
                {lead.role}
              </span>
              {!lead.is_active && (
                <span className="rounded-full bg-status-danger-bg px-2.5 py-0.5 text-xs font-medium text-status-danger-text">
                  Disabled
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500">{lead.email}</p>
            <p className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-gray-400">
              <span className={`h-2 w-2 rounded-full ${leadOnline ? 'bg-status-success-text' : 'bg-gray-300'}`} />
              {leadOnline ? 'Online now' : 'Offline'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {leadOptions.length > 1 && (
            <Select
              value={lead.id}
              aria-label="Switch lead"
              onChange={(id) => navigate(`/leads/${id}`)}
              options={leadOptions}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent"
            />
          )}
          <Link
            to={`/messages/${lead.id}`}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50"
          >
            Message
          </Link>
          <Link
            to={`/contributors/${encodeURIComponent(lead.email)}`}
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50"
          >
            Profile
          </Link>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <button
          onClick={() => shiftWeek(-1)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          ← Prev
        </button>
        <div className="min-w-48 rounded-lg border border-gray-200 bg-white px-4 py-2 text-center text-sm font-medium text-gray-700">
          {formatRange(team.weekStart, team.weekEnd)}
        </div>
        <button
          onClick={() => shiftWeek(1)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
        >
          Next →
        </button>
        {!isCurrentWeek && (
          <button onClick={() => setAnchorDate(new Date())} className="text-sm font-medium text-sky-700 hover:underline">
            Back to this week
          </button>
        )}
      </div>

      {members.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
          <h2 className="text-sm font-semibold text-gray-900">No one is on {lead.name}'s team yet</h2>
          <p className="mt-1 text-sm text-gray-500">Assign contributors to this lead from the Users page.</p>
          <Link
            to="/users"
            className="mt-4 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
          >
            Go to Users
          </Link>
        </div>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatTile label="Team members" hint={`${activeMembers.length} active`}>
              <CountUp value={members.length} />
            </StatTile>
            <StatTile label="Submitted" hint={`${members.reduce((sum, m) => sum + m.logged, 0)} logged this week`}>
              <CountUp value={submitted} />
            </StatTile>
            <StatTile label="Team progress" hint={`${activeSubmitted} of ${activeTarget} target`}>
              <CountUp value={teamProgress * 100} format={percent} />
            </StatTile>
            <StatTile label="No progress" hint={noProgress === 0 ? 'Everyone has submitted' : 'Active, nothing submitted'}>
              <span className={noProgress > 0 ? 'text-status-danger-text' : ''}>
                <CountUp value={noProgress} />
              </span>
            </StatTile>
          </div>

          <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">Team submissions by day</h3>
              <span className="text-xs text-gray-400">tasks</span>
            </div>
            <LineChart data={team.daily} color="#d4a017" unitLabel="submitted tasks" />
          </div>

          <DataTable
            columns={columns}
            data={members}
            getRowId={(m) => m.user.id}
            paginate={false}
            emptyMessage="No team members."
            rowClassName={(m) => (m.user.is_active ? '' : 'opacity-60')}
          />
        </>
      )}
    </div>
  )
}
