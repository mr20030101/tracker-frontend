import { useMemo, useState, type ReactNode } from 'react'
import { FoldText } from '../components/FoldText'
import { Link, Navigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../lib/auth'
import {
  HOURS_LABELS,
  SUPPORT_HOURS,
  ATTENDANCE_CLOSES_MIN_RANGE,
  attendanceTimeLabel,
  fetchAttendanceCloseTimes,
  fetchAttendanceForDate,
  fetchAttendanceRoster,
  minutesToTimeInput,
  sentToGoogleForm,
  setAttendanceClosesMin,
  timeInputToMinutes,
  type AttendanceWithFiler,
} from '../lib/attendance'
import { AttendanceFormModal } from '../components/AttendanceFormModal'
import { FilterAction, FilterBar, FilterField, SearchInput, SegmentedTabs, toolbarControlClass } from '../components/TableToolbar'
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
import { formatTime, todayIso } from '../lib/week'
import { useNow } from '../lib/useNow'
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

export function Attendance() {
  usePageTitle('Attendance')
  const { user } = useAuth()
  const isManager = Boolean(user && MANAGER_ROLES.includes(user.role))
  // Until we know, nothing; a team with attendance switched off (Leads / Team settings page) just gets a note.
  const { attendanceEnabled, loaded } = useTeamFeatures(user?.id)
  // Leads and admins only: contributors file from their Dashboard and the attendance countdown.
  if (user && !isManager) return <Navigate to="/" replace />
  if (!loaded) return null
  if (!attendanceEnabled) return <AttendanceOff isManager={isManager} />
  return <TeamAttendance />
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
    // Newest first: whoever filed most recently at the top. Those who haven't filed come after, in
    // the team's fixed order.
    .sort((a, b) => {
      if (a.entry && b.entry) return Date.parse(b.entry.created_at) - Date.parse(a.entry.created_at)
      if (a.entry || b.entry) return a.entry ? -1 : 1
      return compareAttendanceOrder(a.person, b.person)
    })

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

      <FilterBar
        active={[tab !== 'all', date !== today, team !== ALL_TEAMS, search].filter(Boolean).length}
        onReset={() => {
          setTab('all')
          setDate(today)
          setTeam(ALL_TEAMS)
          setSearch('')
        }}
        actions={
          <FilterAction onClick={exportRows} disabled={visible.length === 0}>
            <Download className="h-3.5 w-3.5" aria-hidden />
            Export
          </FilterAction>
        }
      >
        <FilterField label="Show" wide>
          <SegmentedTabs
            aria-label="Filter by filed"
            value={tab}
            onChange={setTab}
            options={(['all', 'filed', 'missing'] as FilterTab[]).map((t) => ({ value: t, label: TAB_LABELS[t], count: countOf(t) }))}
          />
        </FilterField>
        <FilterField label="Day" id="attendance-day" set={date !== today}>
          <input
            id="attendance-day"
            type="date"
            value={date}
            max={today}
            onChange={(e) => setDate(e.target.value || today)}
            className={toolbarControlClass}
          />
        </FilterField>
        {isAdmin && (
          <FilterField label="Team" id="attendance-team" set={team !== ALL_TEAMS}>
            <Select id="attendance-team" fullWidth value={team} onChange={setTeam} options={teamOptions} className={toolbarControlClass} />
          </FilterField>
        )}
        <FilterField label="Search" id="attendance-search" set={Boolean(search)}>
          <SearchInput id="attendance-search" value={search} onChange={setSearch} placeholder="Contributor" />
        </FilterField>
      </FilterBar>

      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-3">
        {hoursSummary.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
            {hoursSummary.map((s) => (
              <span key={s.hours} className="rounded-full border border-gray-200 bg-white px-2.5 py-1">
                {HOURS_LABELS[s.hours]}: <span className="font-semibold text-gray-700">{s.count}</span>
              </span>
            ))}
          </div>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-x-5 gap-y-2">
          <CloseTimeSetting key={closeTimeLead ?? 'default'} leadId={closeTimeLead} />
          {isAdmin && <PhotoRequiredSetting />}
        </div>
      </div>

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
  // A team can keep its attendance in the Tracker only (Settings → Team): nothing to show for it.
  const { data: teams } = useQuery({ queryKey: ['team-features-list'], queryFn: fetchTeamFeaturesList, staleTime: 60_000 })
  const teamLeadId = entry.person?.lead_id ?? entry.person?.id ?? null
  const retry = useMutation({
    mutationFn: () => sendAttendanceToGoogleForm(entry.user_id, entry.date),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['attendance'] }),
  })

  if (!enabled) return null
  if (teamLeadId && teams?.get(teamLeadId)?.attendanceGformEnabled === false && !sentToGoogleForm(entry)) return null
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

