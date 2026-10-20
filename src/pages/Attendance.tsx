import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../lib/auth'
import {
  HOURS_LABELS,
  SUPPORT_HOURS,
  attendanceWindow,
  ATTENDANCE_CLOSES_LABEL,
  fetchAttendanceForDate,
  fetchAttendanceHistory,
  fetchAttendanceRoster,
  sentToGoogleForm,
  type AttendanceWithFiler,
} from '../lib/attendance'
import { AttendanceFormModal } from '../components/AttendanceFormModal'
import { SearchInput, SegmentedTabs, TableToolbar, toolbarControlClass } from '../components/TableToolbar'
import { Avatar } from '../components/Avatar'
import { Modal } from '../components/Modal'
import { Camera, Check } from 'lucide-react'
import { errorMessage } from '../lib/api'
import {
  fetchAttendancePhoto,
  fetchAttendancePhotoRequired,
  fetchGoogleFormEnabled,
  sendAttendanceToGoogleForm,
  setAttendancePhotoRequired,
} from '../lib/attendancePhoto'
import { Select } from '../components/Select'
import { Switch } from '../components/Switch'
import { downloadCsv } from '../lib/csv'
import { contributorPath } from '../lib/urlRef'
import { formatTime, fromISODate, todayIso } from '../lib/week'
import { useNow } from '../lib/useNow'
import { usePageTitle } from '../lib/usePageTitle'
import type { Attendance as AttendanceEntry, AttendanceHours } from '../types'

const MANAGER_ROLES = ['admin', 'lead']

const pillClass = 'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium'

function hoursPill(hours: AttendanceHours) {
  const style = SUPPORT_HOURS.includes(hours)
    ? 'border-red-500/30 bg-red-500/10 text-red-300'
    : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
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
  avatar_url: string | null
}

type FilterTab = 'all' | 'filed' | 'missing'
const TAB_LABELS: Record<FilterTab, string> = { all: 'All', filed: 'Filed', missing: 'Missing' }
const ALL_TEAMS = ''
const UNASSIGNED = 'unassigned'

/** Admins: whether contributors must take a photo to file their attendance. */
function PhotoRequiredSetting() {
  const queryClient = useQueryClient()
  const { data: required, isLoading } = useQuery({ queryKey: ['attendance-photo-required'], queryFn: fetchAttendancePhotoRequired })
  const save = useMutation({
    mutationFn: setAttendancePhotoRequired,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['attendance-photo-required'] }),
  })
  const checked = save.isPending ? Boolean(save.variables) : Boolean(required)
  return (
    <label className="flex items-center gap-2 text-sm text-gray-700" title={save.error ? errorMessage(save.error, "Couldn't save the setting.") : 'Whether contributors must take a photo to file attendance'}>
      <Switch checked={checked} onChange={(next) => save.mutate(next)} disabled={isLoading || save.isPending} label="Require attendance photo" />
      <span className={save.error ? 'text-red-600' : undefined}>{save.error ? "Couldn't save" : 'Require photo'}</span>
    </label>
  )
}

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
  const [viewingPhoto, setViewingPhoto] = useState<{ ref: string; name: string } | null>(null)

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
    const people: Person[] = (roster?.contributors ?? []).map((c) => ({ id: c.id, name: c.name, email: c.email, lead_id: c.lead_id, avatar_url: c.avatar_url }))
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

      <TableToolbar standalone>
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
        {isAdmin && <PhotoRequiredSetting />}
        <button
          onClick={exportRows}
          disabled={visible.length === 0}
          className="ml-auto h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Export
        </button>
      </TableToolbar>

      {isLoading ? (
        <EmptyCard>Loading...</EmptyCard>
      ) : visible.length === 0 ? (
        <EmptyCard>{tab === 'missing' ? 'Everyone has filed.' : tab === 'filed' ? 'Nobody has filed yet.' : 'No contributors.'}</EmptyCard>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map(({ person, entry }) => (
            <li key={person.id}>
              {/* The whole card opens the form for a mouse; the footer button is the keyboard way in. */}
              <div
                onClick={() => setEditing({ person, entry })}
                className={`flex h-full cursor-pointer flex-col gap-3 rounded-xl border bg-[#0b1624] p-4 text-sm shadow-[inset_0_0_0_1px_rgba(148,163,184,0.08)] transition-colors hover:shadow-lg ${
                  entry ? 'border-slate-700/80 hover:border-slate-600' : 'border-dashed border-[#f7c667]/90 hover:border-[#ffd36a]'
                }`}
              >
                <div className="flex items-start gap-3">
                  <Avatar name={person.name} photoUrl={person.avatar_url} size={40} />
                  <div className="min-w-0 flex-1">
                    <Link
                      to={contributorPath(person.email)}
                      onClick={(e) => e.stopPropagation()}
                      className="block truncate font-semibold text-slate-100 hover:text-sky-400 hover:underline"
                    >
                      {person.name}
                    </Link>
                    <div className="truncate text-xs text-slate-400">{person.email}</div>
                    {isAdmin && person.lead_id && <div className="truncate text-xs text-slate-500">Lead: {leadNames.get(person.lead_id) ?? '—'}</div>}
                  </div>
                  {entry ? hoursPill(entry.hours) : <span className={`${pillClass} shrink-0 border-amber-500/30 bg-amber-500/10 text-amber-300`}>Not filed</span>}
                </div>

                {entry ? (
                  <>
                    <EntryDetails entry={entry} />
                    <div className="mt-auto flex items-center justify-between border-t border-slate-800 pt-2 text-xs text-slate-400">
                      <span>
                        Filed {formatTime(entry.updated_at)}
                        {entry.filed_by !== entry.user_id && <> by {entry.filer?.name ?? 'support'}</>}
                      </span>
                      <span className="flex items-center gap-1">
                        {entry.photo_ref && <PhotoButton onClick={() => setViewingPhoto({ ref: entry.photo_ref!, name: person.name })} />}
                        <CardAction>Edit</CardAction>
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="mt-auto flex items-center justify-between border-t border-slate-800 pt-2 text-xs text-slate-400">
                    <span>No attendance yet</span>
                    <CardAction>File for them</CardAction>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

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
      {viewingPhoto && <PhotoModal photoRef={viewingPhoto.ref} name={viewingPhoto.name} onClose={() => setViewingPhoto(null)} />}
    </div>
  )
}

/** The tasking status, and the Task ID and screenshot when tasking. */
function EntryDetails({ entry }: { entry: AttendanceWithFiler }) {
  const link = entry.screenshot_url && /^https?:\/\//i.test(entry.screenshot_url) ? entry.screenshot_url : null
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-slate-200">{entry.tasking_status}</div>
      {entry.task_id && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="font-mono break-all text-slate-400">{entry.task_id}</span>
          {link && (
            <a href={link} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="font-medium text-sky-400 hover:underline">
              Screenshot
            </a>
          )}
        </div>
      )}
      <GoogleFormStatus entry={entry} />
    </div>
  )
}

/** Whether the entry's latest save reached the team's Google Form, with a Retry when it didn't. */
function GoogleFormStatus({ entry }: { entry: AttendanceWithFiler }) {
  const queryClient = useQueryClient()
  // Shared by every card, and rarely changes (it's a Vercel setting).
  const { data: enabled = false } = useQuery({ queryKey: ['google-form-enabled'], queryFn: fetchGoogleFormEnabled, staleTime: 5 * 60_000 })
  const retry = useMutation({
    mutationFn: () => sendAttendanceToGoogleForm(entry.user_id, entry.date),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['attendance'] }),
  })

  if (!enabled) return null
  if (sentToGoogleForm(entry)) {
    return (
      <div className="flex items-center gap-1 text-xs text-gray-400">
        <Check className="h-3.5 w-3.5" />
        Sent to the Google Form
      </div>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-status-warning-text" onClick={(e) => e.stopPropagation()}>
      <span title={entry.google_form_error ?? undefined}>
        {retry.isError ? errorMessage(retry.error, 'Not sent to the Google Form') : 'Not sent to the Google Form yet'}
      </span>
      <button
        type="button"
        onClick={() => retry.mutate()}
        disabled={retry.isPending}
        className="rounded-md px-1.5 py-0.5 font-semibold underline hover:bg-status-warning-bg disabled:opacity-50"
      >
        {retry.isPending ? 'Sending...' : 'Retry'}
      </button>
    </div>
  )
}

// Bubbles up to the card's own click, which opens the form.
function CardAction({ children }: { children: ReactNode }) {
  return (
    <button type="button" className="rounded-md border border-[#f7c667]/80 bg-[#0b1624] px-2.5 py-1 text-[11px] font-semibold text-[#f7c667] transition-colors hover:bg-[#f7c667]/10">
      {children}
    </button>
  )
}

function PhotoButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className="flex items-center gap-1 rounded-md border border-[#f7c667]/80 bg-[#0b1624] px-2.5 py-1 text-[11px] font-semibold text-[#f7c667] transition-colors hover:bg-[#f7c667]/10"
    >
      <Camera className="h-3.5 w-3.5" />
      Photo
    </button>
  )
}

/** An attendance photo, loaded from Google Drive (through api/attendance-photo) only when opened. */
function PhotoModal({ photoRef, name, onClose }: { photoRef: string; name: string; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let objectUrl: string | null = null
    let cancelled = false
    fetchAttendancePhoto(photoRef).then(
      (loaded) => {
        objectUrl = loaded
        if (cancelled) URL.revokeObjectURL(loaded)
        else setUrl(loaded)
      },
      (err) => !cancelled && setError(errorMessage(err, "This photo couldn't be loaded.")),
    )
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [photoRef])

  return (
    <Modal title={`${name}'s attendance photo`} onClose={onClose}>
      <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg bg-gray-100 text-sm text-gray-400">
        {url ? <img src={url} alt={`${name}'s attendance photo`} className="h-full w-full object-cover" /> : (error ?? 'Loading...')}
      </div>
    </Modal>
  )
}

function EmptyCard({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-gray-200 bg-white px-5 py-10 text-center text-sm text-gray-400">{children}</div>
}

/** Contributors: today's filing and their own history. */
function MyAttendance() {
  const { user } = useAuth()
  const now = useNow(60_000)
  const today = todayIso(now)
  const windowState = attendanceWindow(new Date(now))
  const [filing, setFiling] = useState(false)
  const [viewingPhoto, setViewingPhoto] = useState<string | null>(null)

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

      {isLoading ? (
        <EmptyCard>Loading...</EmptyCard>
      ) : history.length === 0 ? (
        <EmptyCard>No attendance filed yet.</EmptyCard>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {history.map((entry) => (
            <li key={entry.id} className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="font-semibold text-gray-900">{formatDay(entry.date)}</div>
                {hoursPill(entry.hours)}
              </div>
              <EntryDetails entry={entry} />
              <div className="mt-auto flex items-center justify-between border-t border-gray-100 pt-2 text-xs text-gray-400">
                <span>
                  Filed {formatTime(entry.updated_at)}
                  {entry.filed_by !== entry.user_id && <> by {entry.filer?.name ?? 'your lead'}</>}
                </span>
                {entry.photo_ref && <PhotoButton onClick={() => setViewingPhoto(entry.photo_ref)} />}
              </div>
            </li>
          ))}
        </ul>
      )}

      {filing && user && (
        <AttendanceFormModal person={{ id: user.id, name: user.name, email: user.email }} date={today} existing={todays} onClose={() => setFiling(false)} />
      )}
      {viewingPhoto && user && <PhotoModal photoRef={viewingPhoto} name={user.name} onClose={() => setViewingPhoto(null)} />}
    </div>
  )
}
