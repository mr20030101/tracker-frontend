import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { ImagePlus, Pencil, RotateCw, Save, X } from 'lucide-react'
import { FoldText } from '../components/FoldText'
import { Avatar } from '../components/Avatar'
import { DataTable } from '../components/DataTable'
import { Modal } from '../components/Modal'
import { Select } from '../components/Select'
import { FilterBar, FilterField, SearchInput, SegmentedTabs, toolbarControlClass } from '../components/TableToolbar'
import { api, errorMessage } from '../lib/api'
import { useAuth } from '../lib/auth'
import {
  correctHubstaffHours,
  fetchHubstaffHoursOn,
  fetchHubstaffScreenshot,
  fetchOwnHubstaffHours,
  fileHubstaffHours,
  formatHubstaffHours,
  parseHubstaffHours,
  screenshotToJpeg,
  uploadHubstaffScreenshot,
  type HubstaffEntry,
} from '../lib/hubstaff'
import { seesManyTeams } from '../lib/roles'
import { fetchTeamFeaturesList } from '../lib/teamFeatures'
import { contributorPath } from '../lib/urlRef'
import { useManagedLeadIds } from '../lib/useManagedLeadIds'
import { useNow } from '../lib/useNow'
import { usePageTitle } from '../lib/usePageTitle'
import { fromISODate, todayIso } from '../lib/week'
import type { User } from '../types'

const DAY_MS = 24 * 60 * 60 * 1000
const EVERYONE = 'everyone'
const inputClass = 'rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent'
const secondaryButton =
  'inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50'
const primaryButton = 'inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground'

const formatDay = (iso: string) =>
  fromISODate(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Singapore' })
const formatBytes = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`)
const formatTime = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Singapore' })

export function Hubstaff() {
  usePageTitle('Hubstaff')
  const { user } = useAuth()
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-medium text-gray-900 sm:text-4xl">
          <FoldText text="Hubstaff" />
        </h1>
        <p className="max-w-2xl text-sm text-gray-500">
          {user?.role === 'contributor'
            ? 'Each day, enter the hours Hubstaff shows for you and add a screenshot of it. You can file for today or yesterday, and filing a day again replaces it.'
            : "The hours each RST contributor filed from Hubstaff, with their screenshot. Correct the hours when they don't match the screenshot."}
        </p>
      </div>
      {user?.role === 'contributor' ? <FileHours userId={user.id} /> : <TeamHours />}
    </div>
  )
}

function Shot({ refId }: { refId: string }) {
  const { data: url, error } = useQuery({
    queryKey: ['hubstaff', 'screenshot', refId],
    queryFn: async () => URL.createObjectURL(await fetchHubstaffScreenshot(refId)),
    staleTime: Infinity,
    gcTime: 10 * 60_000,
  })
  if (error) return <span className="text-xs text-gray-400">{errorMessage(error, "Couldn't load")}</span>
  if (!url) return <div className="h-11 w-16 animate-pulse rounded bg-gray-100" />
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="block w-16 overflow-hidden rounded border border-gray-200" title="Open the screenshot">
      <img src={url} alt="Hubstaff screenshot" className="h-11 w-16 object-cover object-top" />
    </a>
  )
}

function HoursCell({ entry, usersById }: { entry: HubstaffEntry; usersById?: Map<string, User> }) {
  const corrected = entry.corrected_by !== null
  return (
    <div className="whitespace-nowrap">
      <div className="font-mono text-sm font-semibold text-gray-900 tabular-nums">{formatHubstaffHours(entry.minutes)}</div>
      {corrected && (
        <div className="text-xs text-gray-400">
          Filed {formatHubstaffHours(entry.filed_minutes)}, corrected
          {usersById?.get(entry.corrected_by!) ? ` by ${usersById.get(entry.corrected_by!)!.name}` : ''}
        </div>
      )}
    </div>
  )
}

interface PendingShot {
  name: string
  jpeg: Blob | null
  preview: string
  size: number
  progress: number
  state: 'uploading' | 'done' | 'error'
  ref?: string
  error?: string
}

function FileHours({ userId }: { userId: string }) {
  const queryClient = useQueryClient()
  const now = useNow(60_000)
  const today = todayIso(now)
  const yesterday = todayIso(now - DAY_MS)
  const [day, setDay] = useState<'today' | 'yesterday'>('today')
  const date = day === 'today' ? today : yesterday
  const [hours, setHours] = useState('')
  const [shot, setShot] = useState<PendingShot | null>(null)
  const [dragging, setDragging] = useState(false)
  const [invalid, setInvalid] = useState<{ hours?: boolean; shot?: boolean }>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const hoursRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const dropRef = useRef<HTMLButtonElement>(null)
  const hoursId = useId()
  const shotRef = useRef(shot)
  shotRef.current = shot

  const { data: entries = [], isLoading, error: loadError } = useQuery({
    queryKey: ['hubstaff', 'own', userId],
    queryFn: () => fetchOwnHubstaffHours(userId),
  })
  const existing = entries.find((e) => e.date === date) ?? null

  useEffect(() => {
    setHours(existing ? formatHubstaffHours(existing.minutes) : '')
    setInvalid({})
    setFormError(null)
  }, [date, existing?.id, existing?.updated_at])

  useEffect(() => () => void (shotRef.current && URL.revokeObjectURL(shotRef.current.preview)), [])

  const patch = (change: Partial<PendingShot>) => setShot((s) => (s ? { ...s, ...change } : s))

  const send = (jpeg: Blob) => {
    patch({ state: 'uploading', progress: 0, error: undefined })
    uploadHubstaffScreenshot(jpeg, (progress) => patch({ progress }))
      .then((ref) => patch({ state: 'done', progress: 1, ref }))
      .catch((error: unknown) => patch({ state: 'error', error: errorMessage(error, "Couldn't upload this screenshot.") }))
  }

  const addFile = (files: File[]) => {
    const image = files.find((file) => file.type.startsWith('image/'))
    if (!image) {
      if (files.length) setFormError('Only an image can be added as the screenshot.')
      return
    }
    setFormError(null)
    setSaved(null)
    setInvalid((v) => ({ ...v, shot: false }))
    if (shotRef.current) URL.revokeObjectURL(shotRef.current.preview)
    setShot({ name: image.name || 'Pasted screenshot', jpeg: null, preview: URL.createObjectURL(image), size: image.size, progress: 0, state: 'uploading' })
    screenshotToJpeg(image)
      .then((jpeg) => {
        patch({ jpeg, size: jpeg.size })
        send(jpeg)
      })
      .catch((error: unknown) => patch({ state: 'error', error: errorMessage(error, 'That image could not be read.') }))
  }

  const removeShot = () => {
    if (shotRef.current) URL.revokeObjectURL(shotRef.current.preview)
    setShot(null)
  }

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? [])
      if (files.some((file) => file.type.startsWith('image/'))) {
        e.preventDefault()
        addFile(files)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- addFile only reads refs and setters
  }, [])

  const save = useMutation({
    mutationFn: ({ minutes, ref }: { minutes: number; ref: string | null }) => fileHubstaffHours(date, minutes, ref),
    onSuccess: async (_, { minutes }) => {
      removeShot()
      setSaved(`Saved ${formatHubstaffHours(minutes)} for ${formatDay(date)}.`)
      await queryClient.invalidateQueries({ queryKey: ['hubstaff'] })
    },
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    if (save.isPending) return
    setSaved(null)
    const minutes = parseHubstaffHours(hours)
    const shotProblem = shot
      ? shot.state === 'uploading'
        ? 'Wait for the screenshot to finish uploading.'
        : shot.state === 'error'
          ? 'The screenshot didn\'t upload. Press Retry, or remove it and add it again.'
          : null
      : existing
        ? null
        : 'Add a screenshot of your Hubstaff hours.'
    const next = { hours: minutes === null, shot: Boolean(shotProblem) }
    setInvalid(next)
    if (next.hours) {
      setFormError('Enter your hours as Hubstaff shows them, like 7:32.')
      hoursRef.current?.focus()
      return
    }
    if (shotProblem) {
      setFormError(shotProblem)
      dropRef.current?.focus()
      return
    }
    setFormError(null)
    save.mutate({ minutes: minutes!, ref: shot?.ref ?? null })
  }

  const columns = useMemo<ColumnDef<HubstaffEntry, any>[]>(
    () => [
      { id: 'date', accessorFn: (r) => r.date, header: 'Day', cell: ({ row }) => <span className="whitespace-nowrap text-sm text-gray-700">{formatDay(row.original.date)}</span> },
      { id: 'hours', accessorFn: (r) => r.minutes, header: 'Hours', cell: ({ row }) => <HoursCell entry={row.original} /> },
      { id: 'shot', header: 'Screenshot', enableSorting: false, cell: ({ row }) => <Shot refId={row.original.screenshot_ref} /> },
      {
        id: 'filed',
        accessorFn: (r) => r.updated_at,
        header: 'Filed',
        meta: { align: 'right' },
        cell: ({ row }) => <span className="whitespace-nowrap text-xs text-gray-500">{new Date(row.original.updated_at).toLocaleString(undefined, { timeZone: 'Asia/Singapore', dateStyle: 'medium', timeStyle: 'short' })}</span>,
      },
    ],
    [],
  )

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={submit} noValidate className="card flex max-w-xl flex-col gap-4 p-5">
        <div className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-gray-700">Day</span>
          <SegmentedTabs
            aria-label="Day"
            value={day}
            onChange={(value) => {
              setDay(value)
              setSaved(null)
            }}
            options={[
              { value: 'today', label: `Today, ${formatDay(today)}` },
              { value: 'yesterday', label: `Yesterday, ${formatDay(yesterday)}` },
            ]}
          />
          {existing && (
            <span className="text-xs text-gray-500">
              You filed {formatHubstaffHours(existing.filed_minutes)} for this day
              {existing.corrected_by ? `, corrected to ${formatHubstaffHours(existing.minutes)} by your lead` : ''}. Filing again replaces it.
            </span>
          )}
        </div>

        <label htmlFor={hoursId} className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-gray-700">Hours in Hubstaff</span>
          <input
            id={hoursId}
            ref={hoursRef}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            inputMode="decimal"
            autoComplete="off"
            placeholder="e.g. 7:32"
            aria-invalid={invalid.hours || undefined}
            className={`${inputClass} max-w-40 font-mono ${invalid.hours ? 'border-status-danger-text' : ''}`}
          />
          <span className="text-xs text-gray-400">As Hubstaff shows it (7:32), or in hours (7.5).</span>
        </label>

        <div className="flex flex-col gap-2 text-sm">
          <span className="font-medium text-gray-700">
            Screenshot {existing && <span className="font-normal text-gray-400">(optional, keeps the one you filed)</span>}
          </span>
          {shot ? (
            <div className="flex items-center gap-3 rounded-lg border border-gray-200 p-2">
              <img src={shot.preview} alt="" className="h-12 w-16 shrink-0 rounded border border-gray-100 object-cover" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium text-gray-700">{shot.name}</div>
                <div className="text-xs text-gray-400">
                  JPEG · {formatBytes(shot.size)}
                  {shot.state === 'uploading' && ` · ${Math.round(shot.progress * 100)}%`}
                  {shot.state === 'done' && ' · Uploaded'}
                </div>
                {shot.state === 'uploading' && (
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-gray-100">
                    <div className="h-full bg-accent transition-[width] duration-150" style={{ width: `${Math.round(shot.progress * 100)}%` }} />
                  </div>
                )}
                {shot.state === 'error' && <div className="text-xs text-status-danger-text">{shot.error}</div>}
              </div>
              {shot.state === 'error' && shot.jpeg && (
                <button type="button" onClick={() => send(shot.jpeg!)} className={secondaryButton}>
                  <RotateCw className="h-3.5 w-3.5" aria-hidden />
                  Retry
                </button>
              )}
              <button
                type="button"
                onClick={removeShot}
                aria-label="Remove the screenshot"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          ) : (
            <>
              {existing && (
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <Shot refId={existing.screenshot_ref} />
                  The screenshot you filed
                </div>
              )}
              <button
                ref={dropRef}
                type="button"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragging(true)
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragging(false)
                  addFile(Array.from(e.dataTransfer.files))
                }}
                aria-invalid={invalid.shot || undefined}
                className={`flex flex-col items-center gap-1 rounded-lg border border-dashed px-4 py-5 text-center transition-colors duration-100 ${
                  dragging
                    ? 'border-accent bg-accent-bg text-accent-on-bg'
                    : invalid.shot
                      ? 'border-status-danger-text text-gray-500'
                      : 'border-gray-300 text-gray-500 hover:bg-gray-50'
                }`}
              >
                <ImagePlus className="h-5 w-5" aria-hidden />
                <span className="text-sm font-medium">{dragging ? 'Drop to add' : existing ? 'Replace the screenshot' : 'Add your Hubstaff screenshot'}</span>
                <span className="text-xs text-gray-400">Click, drop an image here, or paste one (Ctrl/⌘ V)</span>
              </button>
            </>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              addFile(Array.from(e.target.files ?? []))
              e.target.value = ''
            }}
          />
        </div>

        {(formError || save.isError) && (
          <div role="alert" className="text-sm text-status-danger-text">
            {formError ?? errorMessage(save.error, "Couldn't save your hours.")}
          </div>
        )}
        {saved && (
          <div role="status" className="text-sm text-status-success-text">
            {saved}
          </div>
        )}

        <div>
          <button type="submit" aria-busy={save.isPending || undefined} className={primaryButton}>
            <Save className="h-4 w-4" aria-hidden />
            {save.isPending ? 'Saving...' : existing ? 'Replace hours' : 'Save hours'}
          </button>
        </div>
      </form>

      <section>
        <h2 className="mb-3 text-lg font-medium text-gray-900">Your Hubstaff hours</h2>
        {Boolean(loadError) && (
          <div role="alert" className="mb-4 text-sm text-status-danger-text">
            {errorMessage(loadError, "Couldn't load your hours.")}
          </div>
        )}
        <DataTable
          columns={columns}
          data={entries}
          getRowId={(r) => String(r.id)}
          isLoading={isLoading}
          pageSize={15}
          emptyMessage="Nothing filed yet. Your days show here once you save them."
        />
      </section>
    </div>
  )
}

interface TeamRow {
  person: User
  entry: HubstaffEntry | null
}

type TeamFilter = 'all' | 'filed' | 'missing'

function StatTile({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="card p-5">
      <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">{label}</div>
      <div className="mt-1 text-3xl font-bold text-gray-900 tabular-nums">{children}</div>
      {hint && <div className="mt-1 text-xs text-gray-500">{hint}</div>}
    </div>
  )
}

function TeamHours() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const isAdmin = seesManyTeams(user?.role)
  const isTeamManager = user?.role === 'team_manager'
  const managedLeadIds = useManagedLeadIds(user?.role)
  const now = useNow(60_000)
  const today = todayIso(now)
  const [date, setDate] = useState(today)
  const [leadId, setLeadId] = useState(isAdmin ? EVERYONE : (user?.id ?? ''))
  const [filter, setFilter] = useState<TeamFilter>('all')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<TeamRow | null>(null)

  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => (await api.get<User[]>('/users')).data,
  })
  const { data: teamFeatures } = useQuery({ queryKey: ['team-features-list'], queryFn: fetchTeamFeaturesList, enabled: isAdmin && !isTeamManager })
  const { data: entries = [], isLoading: entriesLoading, error: entriesError } = useQuery({
    queryKey: ['hubstaff', 'day', date],
    queryFn: () => fetchHubstaffHoursOn(date),
    enabled: Boolean(date),
  })

  const rstLeadIds = useMemo(
    () =>
      new Set(
        isTeamManager
          ? managedLeadIds
          : isAdmin
            ? [...(teamFeatures ?? new Map()).entries()].filter(([, f]) => f.program === 'rst').map(([id]) => id)
            : user
              ? [user.id]
              : [],
      ),
    [isAdmin, isTeamManager, managedLeadIds, teamFeatures, user],
  )

  const leadOptions = useMemo(
    () => [
      { value: EVERYONE, label: 'Every RST team' },
      ...(users ?? []).filter((u) => u.role === 'lead' && rstLeadIds.has(u.id)).map((u) => ({ value: u.id, label: `${u.name}'s team` })),
    ],
    [users, rstLeadIds],
  )

  const usersById = useMemo(() => new Map((users ?? []).map((u) => [u.id, u])), [users])
  const entriesByUser = useMemo(() => new Map(entries.map((e) => [e.user_id, e])), [entries])

  const rows = useMemo<TeamRow[]>(
    () =>
      (users ?? [])
        .filter(
          (u) =>
            u.role === 'contributor' &&
            !u.is_bot &&
            u.lead_id !== null &&
            rstLeadIds.has(u.lead_id) &&
            (leadId === EVERYONE || u.lead_id === leadId) &&
            (u.is_active || entriesByUser.has(u.id)),
        )
        .map((person) => ({ person, entry: entriesByUser.get(person.id) ?? null }))
        .sort((a, b) => a.person.name.localeCompare(b.person.name)),
    [users, rstLeadIds, leadId, entriesByUser],
  )

  const filed = rows.filter((r) => r.entry)
  const totalMinutes = filed.reduce((sum, r) => sum + r.entry!.minutes, 0)
  const corrected = filed.filter((r) => r.entry!.corrected_by).length

  const shown = useMemo(() => {
    const term = search.trim().toLowerCase()
    return rows.filter(
      (r) =>
        (filter === 'all' || (filter === 'filed' ? r.entry : !r.entry)) &&
        (!term || r.person.name.toLowerCase().includes(term) || r.person.email.toLowerCase().includes(term)),
    )
  }, [rows, filter, search])

  const correct = useMutation({
    mutationFn: ({ id, minutes }: { id: number; minutes: number }) => correctHubstaffHours(id, minutes),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['hubstaff'] })
      setEditing(null)
    },
  })

  const columns = useMemo<ColumnDef<TeamRow, any>[]>(
    () => [
      {
        id: 'person',
        accessorFn: (r) => r.person.name,
        header: 'Contributor',
        cell: ({ row }) => {
          const { person } = row.original
          return (
            <Link to={contributorPath(person.email)} className="flex items-center gap-3 hover:underline">
              <Avatar name={person.name} photoUrl={person.avatar_url} size={28} />
              <div className="min-w-0">
                <div className="truncate font-medium text-gray-900">{person.name}</div>
                <div className="truncate text-xs text-gray-400">{person.email}</div>
              </div>
            </Link>
          )
        },
      },
      {
        id: 'hours',
        accessorFn: (r) => r.entry?.minutes ?? -1,
        header: 'Hours',
        cell: ({ row }) => (row.original.entry ? <HoursCell entry={row.original.entry} usersById={usersById} /> : <span className="text-xs text-gray-400">Not filed</span>),
      },
      {
        id: 'shot',
        header: 'Screenshot',
        enableSorting: false,
        cell: ({ row }) => (row.original.entry ? <Shot refId={row.original.entry.screenshot_ref} /> : null),
      },
      {
        id: 'filed',
        accessorFn: (r) => r.entry?.updated_at ?? '',
        header: 'Filed at',
        cell: ({ row }) => (row.original.entry ? <span className="whitespace-nowrap text-xs text-gray-500">{formatTime(row.original.entry.updated_at)}</span> : null),
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        meta: { align: 'right' },
        cell: ({ row }) =>
          row.original.entry ? (
            <button
              type="button"
              onClick={() => {
                correct.reset()
                setEditing(row.original)
              }}
              className="inline-flex min-h-11 items-center gap-1.5 text-xs font-medium text-sky-700 hover:underline"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden />
              Edit hours
            </button>
          ) : null,
      },
    ],
    // correct.reset is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [usersById],
  )

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={date}
          max={today}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          aria-label="Day"
          className={toolbarControlClass}
        />
        {isAdmin && <Select value={leadId} onChange={setLeadId} options={leadOptions} aria-label="Team" className={toolbarControlClass} />}
      </div>

      {Boolean(entriesError) && (
        <div role="alert" className="mb-4 rounded-lg border border-status-danger-text/30 bg-status-danger-bg px-4 py-2.5 text-sm text-status-danger-text">
          Could not load Hubstaff hours: {errorMessage(entriesError, 'Please try again.')}
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Filed" hint={`of ${rows.length} contributors`}>
          {filed.length}
        </StatTile>
        <StatTile label="Total hours" hint={formatDay(date)}>
          {formatHubstaffHours(totalMinutes)}
        </StatTile>
        <StatTile label="Average" hint="Per contributor who filed">
          {filed.length ? formatHubstaffHours(Math.round(totalMinutes / filed.length)) : '—'}
        </StatTile>
        <StatTile label="Corrected" hint="Hours changed by a lead">
          {corrected}
        </StatTile>
      </div>

      {editing?.entry && (
        <CorrectModal
          name={editing.person.name}
          entry={editing.entry}
          isPending={correct.isPending}
          error={correct.error}
          onSave={(minutes) => correct.mutate({ id: editing.entry!.id, minutes })}
          onClose={() => setEditing(null)}
        />
      )}

      <DataTable
        columns={columns}
        data={shown}
        getRowId={(r) => r.person.id}
        isLoading={usersLoading || entriesLoading}
        pageSize={25}
        emptyMessage={rows.length === 0 ? 'No RST contributors on this team.' : 'Nobody matches these filters.'}
        toolbar={
          <FilterBar
            active={[filter !== 'all', search].filter(Boolean).length}
            onReset={() => {
              setFilter('all')
              setSearch('')
            }}
          >
            <FilterField label="Search" id="hubstaff-search">
              <SearchInput id="hubstaff-search" value={search} onChange={setSearch} placeholder="Name or email" />
            </FilterField>
            <FilterField label="Show" wide>
              <SegmentedTabs
                aria-label="Show"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'all', label: 'All', count: rows.length },
                  { value: 'filed', label: 'Filed', count: filed.length },
                  { value: 'missing', label: 'Not filed', count: rows.length - filed.length },
                ]}
              />
            </FilterField>
          </FilterBar>
        }
      />
    </div>
  )
}

function CorrectModal({
  name,
  entry,
  isPending,
  error,
  onSave,
  onClose,
}: {
  name: string
  entry: HubstaffEntry
  isPending: boolean
  error: unknown
  onSave: (minutes: number) => void
  onClose: () => void
}) {
  const [hours, setHours] = useState(formatHubstaffHours(entry.minutes))
  const [invalid, setInvalid] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const id = useId()

  function submit(e: FormEvent) {
    e.preventDefault()
    if (isPending) return
    const minutes = parseHubstaffHours(hours)
    setInvalid(minutes === null)
    if (minutes === null) {
      inputRef.current?.focus()
      return
    }
    onSave(minutes)
  }

  return (
    <Modal title={`Edit ${name}'s hours`} onClose={onClose}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <div className="flex items-start gap-3 text-xs text-gray-500">
          <Shot refId={entry.screenshot_ref} />
          <div>
            {formatDay(entry.date)}. They filed <span className="font-mono font-semibold text-gray-700">{formatHubstaffHours(entry.filed_minutes)}</span>. Open the
            screenshot to check it.
          </div>
        </div>
        <label htmlFor={id} className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-gray-700">Hours</span>
          <input
            id={id}
            ref={inputRef}
            autoFocus
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            inputMode="decimal"
            autoComplete="off"
            aria-invalid={invalid || undefined}
            className={`${inputClass} max-w-40 font-mono ${invalid ? 'border-status-danger-text' : ''}`}
          />
          <span className="text-xs text-gray-400">Set it back to {formatHubstaffHours(entry.filed_minutes)} to undo a correction.</span>
        </label>
        {(invalid || Boolean(error)) && (
          <div role="alert" className="text-sm text-status-danger-text">
            {invalid ? 'Enter hours like 7:32, between 0:00 and 24:00.' : errorMessage(error, "Couldn't save the hours.")}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={secondaryButton}>
            Cancel
          </button>
          <button type="submit" aria-busy={isPending || undefined} className={primaryButton}>
            <Save className="h-4 w-4" aria-hidden />
            {isPending ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
