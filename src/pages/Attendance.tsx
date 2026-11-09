import { useMemo, useState, type ReactNode } from 'react'
import { FoldText } from '../components/FoldText'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../lib/auth'
import {
  HOURS_LABELS,
  SUPPORT_HOURS,
  ATTENDANCE_CLOSES_MIN_RANGE,
  attendanceTimeLabel,
  attendanceWindow,
  fetchAttendanceCloseTimes,
  fetchAttendanceForDate,
  fetchAttendanceHistory,
  fetchAttendanceRoster,
  fetchTeamAttendanceForDate,
  minutesToTimeInput,
  sentToGoogleForm,
  setAttendanceClosesMin,
  timeInputToMinutes,
  type AttendanceWithFiler,
} from '../lib/attendance'
import { AttendanceFormModal } from '../components/AttendanceFormModal'
import { SearchInput, SegmentedTabs, TableToolbar, toolbarControlClass } from '../components/TableToolbar'
import { AttendanceAvatar } from '../components/AttendanceAvatar'
import { Modal } from '../components/Modal'
import { Camera, Check, CircleSlash, Clock, Download, FilePlus, Pencil, RotateCcw, RotateCw, Save, TriangleAlert, X, type LucideIcon } from 'lucide-react'
import { errorMessage } from '../lib/api'
import {
  fetchAttendancePhotoRequired,
  fetchGoogleFormEnabled,
  sendAttendanceToGoogleForm,
  setAttendancePhotoRequired,
} from '../lib/attendancePhoto'
import { Select } from '../components/Select'
import { Switch } from '../components/Switch'
import { downloadCsv } from '../lib/csv'
import { compareAttendanceOrder } from '../lib/attendanceOrder'
import { contributorPath } from '../lib/urlRef'
import { formatTime, fromISODate, todayIso } from '../lib/week'
import { useNow } from '../lib/useNow'
import { useAttendanceClosesMin } from '../lib/useAttendanceClosesMin'
import { usePageTitle } from '../lib/usePageTitle'
import { useAttendancePhoto } from '../lib/useAttendancePhoto'
import { fetchTeamFeaturesList, useTeamFeatures } from '../lib/teamFeatures'
import type { Attendance as AttendanceEntry, AttendanceHours } from '../types'

const MANAGER_ROLES = ['admin', 'lead']

const statusClass = 'inline-flex shrink-0 items-center gap-1.5 text-xs'

function hoursStatus(hours: AttendanceHours) {
  return SUPPORT_HOURS.includes(hours) ? (
    <span className={`${statusClass} font-semibold text-gray-900`}>
      <TriangleAlert className="h-4 w-4 text-gray-500" aria-hidden />
      {HOURS_LABELS[hours]}
    </span>
  ) : (
    <span className={`${statusClass} font-medium text-gray-700`}>
      <Clock className="h-4 w-4 text-gray-400" aria-hidden />
      {HOURS_LABELS[hours]}
    </span>
  )
}

function NotFiled() {
  return (
    <span className={`${statusClass} font-semibold text-status-danger-text`}>
      <CircleSlash className="h-4 w-4" aria-hidden />
      Not filed
    </span>
  )
}

function formatDay(iso: string) {
  return fromISODate(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'Asia/Singapore' })
}

export function Attendance() {
  usePageTitle('Attendance')
  const { user } = useAuth()
  const isManager = Boolean(user && MANAGER_ROLES.includes(user.role))
  // Until we know, nothing; a team with attendance switched off (Leads / Team settings page) just gets a note.
  const { attendanceEnabled, attendancePublic, loaded } = useTeamFeatures(user?.id)
  if (!loaded) return null
  if (!attendanceEnabled) return <AttendanceOff isManager={isManager} />
  return isManager ? <TeamAttendance /> : <MyAttendance teamPublic={attendancePublic} />
}

function AttendanceOff({ isManager }: { isManager: boolean }) {
  return (
    <div>
      <h1 className="mb-2 text-3xl font-medium sm:text-4xl text-gray-900"><FoldText text="Attendance" /></h1>
      <div className="card px-5 py-6 text-sm text-gray-600">
        {isManager ? (
          <>
            Attendance is switched off for your team, so your contributors don't file it in the Tracker. You can turn it back on
            in{' '}
            <Link to="/leads" className="font-medium text-sky-700 hover:underline">
              Team settings
            </Link>
            .
          </>
        ) : (
          "Your team doesn't take attendance in the Tracker, so there's nothing to file here."
        )}
      </div>
    </div>
  )
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

/**
 * When attendance closes: a lead's own team (leadId), or for an admin, any team's or (leadId null)
 * the default everyone else uses. A team without its own time shows the default.
 */
function CloseTimeSetting({ leadId }: { leadId: string | null }) {
  const queryClient = useQueryClient()
  const { data: times } = useQuery({ queryKey: ['attendance-close-times'], queryFn: fetchAttendanceCloseTimes })
  const teamMin = leadId ? times?.teams.get(leadId) : undefined
  const current = teamMin ?? times?.defaultMin
  // What's typed, until it's saved.
  const [draft, setDraft] = useState<string | null>(null)
  const save = useMutation({
    mutationFn: (closesMin: number | null) => setAttendanceClosesMin(leadId, closesMin),
    onSuccess: () => {
      setDraft(null)
      queryClient.invalidateQueries({ queryKey: ['attendance-close-times'] })
      queryClient.invalidateQueries({ queryKey: ['attendance-closes-min'] })
    },
  })

  const draftMin = draft === null ? null : timeInputToMinutes(draft)
  const changed = draftMin !== null && draftMin !== current
  const valid = draftMin !== null && draftMin >= ATTENDANCE_CLOSES_MIN_RANGE.min && draftMin <= ATTENDANCE_CLOSES_MIN_RANGE.max
  const error = save.error ? errorMessage(save.error, "Couldn't save the closing time.") : changed && !valid ? 'Pick a time after 6:00 AM.' : null

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (changed && valid && !save.isPending) save.mutate(draftMin)
      }}
      className="flex items-center gap-2 text-sm text-gray-700"
      title={error ?? (leadId ? 'When this team can no longer file their own attendance' : 'When attendance closes for teams without their own time')}
    >
      <label className="flex items-center gap-2">
        <span className="whitespace-nowrap">{leadId ? 'Team closes at' : 'Closes at'}</span>
        <input
          type="time"
          value={draft ?? (current !== undefined ? minutesToTimeInput(current) : '')}
          min={minutesToTimeInput(ATTENDANCE_CLOSES_MIN_RANGE.min)}
          max={minutesToTimeInput(ATTENDANCE_CLOSES_MIN_RANGE.max)}
          onChange={(e) => setDraft(e.target.value)}
          disabled={!times || save.isPending}
          className={toolbarControlClass}
        />
      </label>
      {changed ? (
        <>
          <button
            type="submit"
            aria-busy={save.isPending}
            className="inline-flex h-9 pointer-coarse:h-11 items-center gap-1.5 rounded-full bg-accent px-3 text-sm font-semibold text-accent-foreground"
          >
            <Save className="h-4 w-4" aria-hidden />
            {save.isPending ? 'Saving...' : 'Save'}
          </button>
          <button type="button" onClick={() => setDraft(null)} className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:underline pointer-coarse:min-h-11">
            <X className="h-3.5 w-3.5" aria-hidden />
            Cancel
          </button>
        </>
      ) : (
        leadId &&
        times &&
        (teamMin === undefined ? (
          <span className="text-xs text-gray-400">Default</span>
        ) : (
          <button
            type="button"
            onClick={() => !save.isPending && save.mutate(null)}
            aria-busy={save.isPending}
            className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:underline pointer-coarse:min-h-11"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            Use default ({attendanceTimeLabel(times.defaultMin)})
          </button>
        ))
      )}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </form>
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
  // The closing time shown and changed here: a lead's own team; for an admin, the team picked in the
  // filter, or the default when it's all teams or no lead.
  const closeTimeLead = isAdmin ? (team !== ALL_TEAMS && team !== UNASSIGNED ? team : null) : (user?.id ?? null)
  const { data: closeTimes } = useQuery({ queryKey: ['attendance-close-times'], queryFn: fetchAttendanceCloseTimes })
  const closesMin = closeTimes && ((closeTimeLead ? closeTimes.teams.get(closeTimeLead) : undefined) ?? closeTimes.defaultMin)

  const { data: rosterAll, isLoading: rosterLoading } = useQuery({
    queryKey: ['attendance', 'roster'],
    queryFn: fetchAttendanceRoster,
  })
  // Teams with attendance switched off aren't expected to file, so they're left out here.
  const { data: teamFeatures } = useQuery({ queryKey: ['team-features-list'], queryFn: fetchTeamFeaturesList })
  const roster = useMemo(() => {
    if (!rosterAll) return undefined
    const off = (leadId: string | null) => Boolean(leadId && teamFeatures?.get(leadId)?.attendanceEnabled === false)
    return {
      contributors: rosterAll.contributors.filter((c) => !off(c.lead_id)),
      leads: rosterAll.leads.filter((l) => !off(l.id)),
    }
  }, [rosterAll, teamFeatures])
  const { data: entries = [], isLoading: entriesLoading } = useQuery({
    queryKey: ['attendance', 'date', date],
    queryFn: () => fetchAttendanceForDate(date),
    refetchInterval: date === today ? 2 * 60_000 : false,
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
    // The team's fixed order; the missing ones stand out in red instead of moving.
    .sort((a, b) => compareAttendanceOrder(a.person, b.person))

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
        <h1 className="text-3xl font-medium sm:text-4xl text-gray-900"><FoldText text="Attendance" /></h1>
        <p className="text-sm text-gray-500">
          Who filed their daily attendance, and who hasn't yet. Contributors file theirs from the Dashboard until{' '}
          {closesMin !== undefined ? attendanceTimeLabel(closesMin) : 'their closing time'}
          {isAdmin && !closeTimeLead && ', unless their team closes at a different time'}. Open
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
        <CloseTimeSetting key={closeTimeLead ?? 'default'} leadId={closeTimeLead} />
        {isAdmin && <PhotoRequiredSetting />}
        <button
          onClick={exportRows}
          disabled={visible.length === 0}
          className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <Download className="h-4 w-4" aria-hidden />
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
                className={`flex h-full cursor-pointer flex-col gap-3 card p-4 text-sm transition-colors duration-75 ${
                  entry ? 'hover:bg-gray-50' : 'border-status-danger-text/50 bg-status-danger-bg hover:border-status-danger-text'
                }`}
              >
                <div className="flex items-start gap-3">
                  <AttendanceAvatar name={person.name} avatarUrl={person.avatar_url} photoRef={entry?.photo_ref} />
                  <div className="min-w-0 flex-1">
                    <Link
                      to={contributorPath(person.email)}
                      onClick={(e) => e.stopPropagation()}
                      className="block truncate font-semibold text-gray-900 hover:text-sky-600 hover:underline"
                    >
                      {person.name}
                    </Link>
                    <div className="truncate text-xs text-gray-500">{person.email}</div>
                    {isAdmin && person.lead_id && <div className="truncate text-xs text-gray-400">Lead: {leadNames.get(person.lead_id) ?? '—'}</div>}
                  </div>
                  {entry ? (
                    hoursStatus(entry.hours)
                  ) : (
                    <NotFiled />
                  )}
                </div>

                {entry ? (
                  <>
                    <EntryDetails entry={entry} />
                    <div className="mt-auto flex items-center justify-between border-t border-gray-100 pt-2 text-xs text-gray-400">
                      <span>
                        Filed {formatTime(entry.updated_at)}
                        {entry.filed_by !== entry.user_id && <> by {entry.filer?.name ?? 'support'}</>}
                      </span>
                      <span className="flex items-center gap-1">
                        {entry.photo_ref && <PhotoButton onClick={() => setViewingPhoto({ ref: entry.photo_ref!, name: person.name })} />}
                        <CardAction icon={Pencil}>Edit</CardAction>
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="mt-auto flex items-center justify-between border-t border-status-danger-text/20 pt-2 text-xs font-medium text-status-danger-text">
                    <span>No attendance yet</span>
                    <CardAction icon={FilePlus} primary>
                      File for them
                    </CardAction>
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
      <div className="text-gray-800">{entry.tasking_status}</div>
      {entry.task_id && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="font-mono break-all text-gray-500">{entry.task_id}</span>
          {link && (
            <a href={link} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="font-medium text-sky-600 hover:underline">
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
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-900" onClick={(e) => e.stopPropagation()}>
      <TriangleAlert className="h-4 w-4 text-gray-500" aria-hidden />
      <span className="font-semibold">{retry.isError ? errorMessage(retry.error, 'Not sent to the Google Form') : 'Not sent to the Google Form yet'}</span>
      <button
        type="button"
        onClick={() => !retry.isPending && retry.mutate()}
        aria-busy={retry.isPending}
        className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 font-semibold underline hover:bg-gray-100 pointer-coarse:min-h-11 pointer-coarse:px-3"
      >
        <RotateCw className="h-3.5 w-3.5" aria-hidden />
        {retry.isPending ? 'Sending...' : 'Retry'}
      </button>
      {!retry.isError && entry.google_form_error && <span className="w-full break-words text-gray-500">{entry.google_form_error}</span>}
    </div>
  )
}

// Bubbles up to the card's own click, which opens the form.
function CardAction({ children, icon: Icon, primary = false }: { children: ReactNode; icon: LucideIcon; primary?: boolean }) {
  const tone = primary ? 'border-accent bg-accent text-accent-foreground hover:opacity-90' : cardButtonTone
  return (
    <button type="button" className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors pointer-coarse:min-h-11 pointer-coarse:px-3 ${tone}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {children}
    </button>
  )
}

const cardButtonTone = 'border-gray-200 bg-white text-gray-700 hover:bg-gray-100'

function PhotoButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={`flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors pointer-coarse:min-h-11 pointer-coarse:px-3 ${cardButtonTone}`}
    >
      <Camera className="h-3.5 w-3.5" />
      Photo
    </button>
  )
}

/** An attendance photo, loaded from Google Drive (through api/attendance-photo) only when opened. */
function PhotoModal({ photoRef, name, onClose }: { photoRef: string; name: string; onClose: () => void }) {
  const { url, error } = useAttendancePhoto(photoRef)
  return (
    <Modal title={`${name}'s attendance photo`} onClose={onClose}>
      <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg bg-gray-100 text-sm text-gray-400">
        {url ? (
          <img src={url} alt={`${name}'s attendance photo`} className="h-full w-full object-cover" />
        ) : error ? (
          errorMessage(error, "This photo couldn't be loaded.")
        ) : (
          'Loading...'
        )}
      </div>
    </Modal>
  )
}

function EmptyCard({ children }: { children: ReactNode }) {
  return <div className="card px-5 py-10 text-center text-sm text-gray-400">{children}</div>
}

type ContributorTab = 'mine' | 'team'

/** Contributors: today's filing and their own history, and the team's day when the team's attendance is public. */
function MyAttendance({ teamPublic }: { teamPublic: boolean }) {
  const { user } = useAuth()
  const now = useNow(60_000)
  const today = todayIso(now)
  const { closesMin, closesLabel } = useAttendanceClosesMin()
  const windowState = attendanceWindow(new Date(now), closesMin)
  const [filing, setFiling] = useState(false)
  const [viewingPhoto, setViewingPhoto] = useState<string | null>(null)
  const [tab, setTab] = useState<ContributorTab>('mine')
  const showTeam = teamPublic && tab === 'team'

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
          <h1 className="text-3xl font-medium sm:text-4xl text-gray-900"><FoldText text="Attendance" /></h1>
          <p className="text-sm text-gray-500">
            File your attendance once a day, between 6:00 AM and {closesLabel}. If you can't, your lead files it for you.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={() => windowState === 'open' && setFiling(true)}
            aria-disabled={windowState !== 'open'}
            aria-describedby={windowState === 'open' ? undefined : 'attendance-window-note'}
            className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold pointer-coarse:min-h-11 ${
              windowState === 'open' ? 'bg-accent text-accent-foreground' : 'cursor-not-allowed border border-gray-300 bg-gray-100 text-gray-700'
            }`}
          >
            {todays ? <Pencil className="h-4 w-4" aria-hidden /> : <FilePlus className="h-4 w-4" aria-hidden />}
            {todays ? "Edit today's attendance" : "File today's attendance"}
          </button>
          {windowState !== 'open' && (
            <p id="attendance-window-note" className="text-xs text-gray-600">
              {windowState === 'not-open' ? 'Opens at 6:00 AM.' : `Closed at ${closesLabel}. Your lead can file it for you.`}
            </p>
          )}
        </div>
      </div>

      {teamPublic && (
        <div className="mb-3">
          <SegmentedTabs
            aria-label="Whose attendance"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'mine', label: 'Mine' },
              { value: 'team', label: 'Team' },
            ]}
          />
        </div>
      )}

      {showTeam ? (
        <TeammatesAttendance today={today} />
      ) : isLoading ? (
        <EmptyCard>Loading...</EmptyCard>
      ) : history.length === 0 ? (
        <EmptyCard>No attendance filed yet.</EmptyCard>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {history.map((entry) => (
            <li key={entry.id} className="flex flex-col gap-3 card p-4 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="font-semibold text-gray-900">{formatDay(entry.date)}</div>
                {hoursStatus(entry.hours)}
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

/** A public team's day, as its contributors see it: who filed, their hours and status, and their photo. */
function TeammatesAttendance({ today }: { today: string }) {
  const { user } = useAuth()
  const [date, setDate] = useState(today)
  const [filter, setFilter] = useState<FilterTab>('all')
  const [viewingPhoto, setViewingPhoto] = useState<{ ref: string; name: string } | null>(null)
  const { data: team = [], isLoading } = useQuery({
    queryKey: ['attendance', 'team', date],
    queryFn: () => fetchTeamAttendanceForDate(date),
    refetchInterval: date === today ? 5 * 60_000 : false,
  })

  const filed = team.filter((t) => t.hours)
  const countOf = (t: FilterTab) => (t === 'all' ? team.length : t === 'filed' ? filed.length : team.length - filed.length)
  const visible = team.filter((t) => (filter === 'all' ? true : filter === 'filed' ? t.hours : !t.hours))

  return (
    <>
      <TableToolbar standalone>
        <input
          type="date"
          value={date}
          max={today}
          onChange={(e) => setDate(e.target.value || today)}
          aria-label="Day"
          className={toolbarControlClass}
        />
        <SegmentedTabs
          aria-label="Filter by filed"
          value={filter}
          onChange={setFilter}
          options={(['all', 'filed', 'missing'] as FilterTab[]).map((t) => ({ value: t, label: TAB_LABELS[t], count: countOf(t) }))}
        />
      </TableToolbar>

      {isLoading ? (
        <EmptyCard>Loading...</EmptyCard>
      ) : visible.length === 0 ? (
        <EmptyCard>{filter === 'missing' ? 'Everyone has filed.' : filter === 'filed' ? 'Nobody has filed yet.' : 'No teammates.'}</EmptyCard>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((mate) => (
            <li
              key={mate.user_id}
              className={`flex items-start gap-3 card p-4 text-sm ${mate.hours ? '' : 'border-status-danger-text/50 bg-status-danger-bg'}`}
            >
              {mate.photo_ref ? (
                <button
                  type="button"
                  onClick={() => setViewingPhoto({ ref: mate.photo_ref!, name: mate.name })}
                  aria-label={`See ${mate.name}'s attendance photo`}
                  className="shrink-0 rounded-full"
                >
                  <AttendanceAvatar name={mate.name} avatarUrl={mate.avatar_url} photoRef={mate.photo_ref} size={48} />
                </button>
              ) : (
                <AttendanceAvatar name={mate.name} avatarUrl={mate.avatar_url} photoRef={null} size={48} />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="truncate font-semibold text-gray-900">
                    {mate.name}
                    {mate.user_id === user?.id && <span className="ml-1 font-normal text-gray-400">(you)</span>}
                  </div>
                  {mate.hours ? (
                    hoursStatus(mate.hours)
                  ) : (
                    <NotFiled />
                  )}
                </div>
                {mate.tasking_status && <div className="mt-1 text-gray-700">{mate.tasking_status}</div>}
                {mate.filed_at && <div className="mt-1 text-xs text-gray-400">Filed {formatTime(mate.filed_at)}</div>}
              </div>
            </li>
          ))}
        </ul>
      )}

      {viewingPhoto && <PhotoModal photoRef={viewingPhoto.ref} name={viewingPhoto.name} onClose={() => setViewingPhoto(null)} />}
    </>
  )
}
