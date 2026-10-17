import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../lib/auth'
import {
  HOURS_LABELS,
  SUPPORT_HOURS,
  attendanceWindow,
  ATTENDANCE_CLOSES_LABEL,
  fetchAttendanceForDate,
  fetchAttendanceHistory,
  fetchAttendanceRoster,
  type AttendanceWithFiler,
} from '../lib/attendance'
import { AttendanceFormModal } from '../components/AttendanceFormModal'
import { SearchInput, SegmentedTabs, TableCard, TableToolbar, toolbarControlClass } from '../components/TableToolbar'
import { Select } from '../components/Select'
import { downloadCsv } from '../lib/csv'
import { contributorPath } from '../lib/urlRef'
import { formatTime, fromISODate, todayIso } from '../lib/week'
import { useNow } from '../lib/useNow'
import { usePageTitle } from '../lib/usePageTitle'
import type { Attendance as AttendanceEntry, AttendanceHours } from '../types'

const MANAGER_ROLES = ['admin', 'lead']

const pillClass = 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium'

function hoursPill(hours: AttendanceHours) {
  const style = SUPPORT_HOURS.includes(hours) ? 'bg-status-danger-bg text-status-danger-text' : 'bg-status-success-bg text-status-success-text'
  return <span className={`${pillClass} ${style}`}>{HOURS_LABELS[hours]}</span>
}

function formatDay(iso: string) {
  return fromISODate(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'Asia/Singapore' })
}

export function Attendance() {
  usePageTitle('Attendance')
  const { user } = useAuth()
  const isManager = Boolean(user && MANAGER_ROLES.includes(user.role))
  return isManager ? <TeamAttendance /> : <MyAttendance />
}

interface Person {
  id: string
  name: string
  email: string
  lead_id: string | null
}

type FilterTab = 'all' | 'filed' | 'missing'
const TAB_LABELS: Record<FilterTab, string> = { all: 'All', filed: 'Filed', missing: 'Missing' }
const ALL_TEAMS = ''
const UNASSIGNED = 'unassigned'

/** Leads and admins: who has and hasn't filed on a given day, and filing for someone on their behalf. */
function TeamAttendance() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const now = useNow(60_000)
  const today = todayIso(now)
  const [date, setDate] = useState(today)
  const [tab, setTab] = useState<FilterTab>('all')
  const [team, setTeam] = useState(ALL_TEAMS)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<{ person: Person; entry: AttendanceEntry | null } | null>(null)

  const { data: roster, isLoading: rosterLoading } = useQuery({
    queryKey: ['attendance', 'roster'],
    queryFn: fetchAttendanceRoster,
  })
  const { data: entries = [], isLoading: entriesLoading } = useQuery({
    queryKey: ['attendance', 'date', date],
    queryFn: () => fetchAttendanceForDate(date),
    refetchInterval: date === today ? 30_000 : false,
  })
  const isLoading = rosterLoading || entriesLoading

  const leadNames = useMemo(() => new Map((roster?.leads ?? []).map((l) => [l.id, l.name])), [roster])

  // Everyone on the roster, plus anyone who filed that day but has since left it (deactivated).
  const rows = useMemo(() => {
    const byUser = new Map(entries.map((e) => [e.user_id, e]))
    const people: Person[] = (roster?.contributors ?? []).map((c) => ({ id: c.id, name: c.name, email: c.email, lead_id: c.lead_id }))
    const onRoster = new Set(people.map((p) => p.id))
    for (const e of entries) {
      if (!onRoster.has(e.user_id) && e.person) people.push(e.person)
    }
    return people.map((person) => ({ person, entry: byUser.get(person.id) ?? null }))
  }, [roster, entries])

  const term = search.trim().toLowerCase()
  const scoped = rows.filter(({ person }) => {
    if (team === UNASSIGNED ? person.lead_id !== null : team !== ALL_TEAMS && person.lead_id !== team) return false
    return !term || person.name.toLowerCase().includes(term) || person.email.toLowerCase().includes(term)
  })
  const filed = scoped.filter((r) => r.entry)
  const countOf = (t: FilterTab) => (t === 'all' ? scoped.length : t === 'filed' ? filed.length : scoped.length - filed.length)
  const visible = scoped
    .filter((r) => (tab === 'all' ? true : tab === 'filed' ? r.entry : !r.entry))
    // Missing first, so the people still to chase sit at the top.
    .sort((a, b) => Number(Boolean(a.entry)) - Number(Boolean(b.entry)) || a.person.name.localeCompare(b.person.name))

  const hoursSummary = (Object.keys(HOURS_LABELS) as AttendanceHours[])
    .map((h) => ({ hours: h, count: filed.filter((r) => r.entry!.hours === h).length }))
    .filter((s) => s.count > 0)

  const teamOptions = [
    { value: ALL_TEAMS, label: 'All teams' },
    ...(roster?.leads ?? []).map((l) => ({ value: l.id, label: l.name })),
    { value: UNASSIGNED, label: 'No lead' },
  ]

  function exportRows() {
    downloadCsv(
      `attendance-${date}.csv`,
      visible.map(({ person, entry }) => ({
        Date: date,
        'CB Email': person.email,
        'CB Name': person.name,
        Lead: person.lead_id ? (leadNames.get(person.lead_id) ?? '') : '',
        Hours: entry ? HOURS_LABELS[entry.hours] : 'Not filed',
        'Tasking Status': entry?.tasking_status ?? '',
        'Task ID': entry?.task_id ?? '',
        Screenshot: entry?.screenshot_url ?? '',
        'Filed At': entry ? new Date(entry.updated_at).toLocaleString(undefined, { timeZone: 'Asia/Singapore' }) : '',
        'Filed By': entry && entry.filed_by !== entry.user_id ? (entry.filer?.name ?? '') : '',
      })),
    )
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Attendance</h1>
        <p className="text-sm text-gray-500">
          Who filed their daily attendance, and who hasn't yet. Contributors file theirs from the Dashboard until {ATTENDANCE_CLOSES_LABEL}. Open
          anyone's row to file or correct it for them.
        </p>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SegmentedTabs
          aria-label="Filter by filed"
          value={tab}
          onChange={setTab}
          options={(['all', 'filed', 'missing'] as FilterTab[]).map((t) => ({ value: t, label: TAB_LABELS[t], count: countOf(t) }))}
        />
        {hoursSummary.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
            {hoursSummary.map((s) => (
              <span key={s.hours} className="rounded-full border border-gray-200 bg-white px-2.5 py-1">
                {HOURS_LABELS[s.hours]}: <span className="font-semibold text-gray-700">{s.count}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      <TableCard
        toolbar={
          <TableToolbar>
            <input
              type="date"
              value={date}
              max={today}
              onChange={(e) => setDate(e.target.value || today)}
              aria-label="Day"
              className={toolbarControlClass}
            />
            {isAdmin && <Select value={team} onChange={setTeam} options={teamOptions} aria-label="Filter by team" className={toolbarControlClass} />}
            <SearchInput value={search} onChange={setSearch} placeholder="Search contributor..." />
            <button
              onClick={exportRows}
              disabled={visible.length === 0}
              className="ml-auto h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Export
            </button>
          </TableToolbar>
        }
      >
        <table className="w-full min-w-[52rem] text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
            <tr>
              <th className="px-5 py-3">Contributor</th>
              <th className="px-5 py-3">Hours</th>
              <th className="px-5 py-3">Tasking status</th>
              <th className="px-5 py-3">Task</th>
              <th className="px-5 py-3">Filed</th>
              <th className="px-5 py-3 text-right" />
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
            {!isLoading && visible.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-6 text-center text-gray-400">
                  {tab === 'missing' ? 'Everyone has filed.' : tab === 'filed' ? 'Nobody has filed yet.' : 'No contributors.'}
                </td>
              </tr>
            )}
            {!isLoading &&
              visible.map(({ person, entry }) => (
                <tr key={person.id} onClick={() => setEditing({ person, entry })} className="cursor-pointer align-top hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <Link to={contributorPath(person.email)} onClick={(e) => e.stopPropagation()} className="font-medium text-sky-700 hover:underline">
                      {person.name}
                    </Link>
                    <div className="text-xs text-gray-400">{person.email}</div>
                    {isAdmin && person.lead_id && <div className="text-xs text-gray-400">Lead: {leadNames.get(person.lead_id) ?? '—'}</div>}
                  </td>
                  <td className="px-5 py-3">
                    {entry ? hoursPill(entry.hours) : <span className={`${pillClass} bg-status-warning-bg text-status-warning-text`}>Not filed</span>}
                  </td>
                  <td className="max-w-xs px-5 py-3 text-gray-600">{entry?.tasking_status ?? <span className="text-gray-400">—</span>}</td>
                  <td className="px-5 py-3">
                    {entry?.task_id ? <TaskCell entry={entry} /> : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-5 py-3 text-xs text-gray-500">
                    {entry ? (
                      <>
                        {formatTime(entry.updated_at)}
                        {entry.filed_by !== entry.user_id && <div className="text-gray-400">by {entry.filer?.name ?? 'support'}</div>}
                      </>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50">
                      {entry ? 'Edit' : 'File'}
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </TableCard>

      {editing && (
        <AttendanceFormModal
          key={editing.person.id}
          person={editing.person}
          date={date}
          existing={editing.entry}
          support={editing.person.id !== user?.id}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function TaskCell({ entry }: { entry: AttendanceWithFiler }) {
  const link = entry.screenshot_url && /^https?:\/\//i.test(entry.screenshot_url) ? entry.screenshot_url : null
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <span className="font-mono text-xs break-all">{entry.task_id}</span>
      {link && (
        <div>
          <a href={link} target="_blank" rel="noopener noreferrer" className="text-xs text-sky-700 hover:underline">
            Screenshot
          </a>
        </div>
      )}
    </div>
  )
}

/** Contributors: today's filing and their own history. */
function MyAttendance() {
  const { user } = useAuth()
  const now = useNow(60_000)
  const today = todayIso(now)
  const windowState = attendanceWindow(new Date(now))
  const [filing, setFiling] = useState(false)

  const { data: history = [], isLoading } = useQuery({
    queryKey: ['attendance', 'history', user?.id],
    queryFn: () => fetchAttendanceHistory(user!.id),
    enabled: Boolean(user),
  })
  const todays = history.find((e) => e.date === today) ?? null

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Attendance</h1>
          <p className="text-sm text-gray-500">
            File your attendance once a day, between 6:00 AM and {ATTENDANCE_CLOSES_LABEL}. If you can't, your lead files it for you.
          </p>
        </div>
        <button
          onClick={() => setFiling(true)}
          disabled={windowState !== 'open'}
          title={windowState === 'not-open' ? 'Opens at 6:00 AM' : windowState === 'closed' ? `Closed at ${ATTENDANCE_CLOSES_LABEL}` : undefined}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          {todays ? "Edit today's attendance" : "File today's attendance"}
        </button>
      </div>

      <TableCard>
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
            <tr>
              <th className="px-5 py-3">Day</th>
              <th className="px-5 py-3">Hours</th>
              <th className="px-5 py-3">Tasking status</th>
              <th className="px-5 py-3">Task</th>
              <th className="px-5 py-3">Filed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && (
              <tr>
                <td colSpan={5} className="px-5 py-6 text-center text-gray-400">
                  Loading...
                </td>
              </tr>
            )}
            {!isLoading && history.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-6 text-center text-gray-400">
                  No attendance filed yet.
                </td>
              </tr>
            )}
            {history.map((entry) => (
              <tr key={entry.id} className="align-top">
                <td className="px-5 py-3 font-medium text-gray-900">{formatDay(entry.date)}</td>
                <td className="px-5 py-3">{hoursPill(entry.hours)}</td>
                <td className="max-w-xs px-5 py-3 text-gray-600">{entry.tasking_status}</td>
                <td className="px-5 py-3">{entry.task_id ? <TaskCell entry={entry} /> : <span className="text-gray-400">—</span>}</td>
                <td className="px-5 py-3 text-xs text-gray-500">
                  {formatTime(entry.updated_at)}
                  {entry.filed_by !== entry.user_id && <div className="text-gray-400">by {entry.filer?.name ?? 'your lead'}</div>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>

      {filing && user && (
        <AttendanceFormModal person={{ id: user.id, name: user.name, email: user.email }} date={today} existing={todays} onClose={() => setFiling(false)} />
      )}
    </div>
  )
}
