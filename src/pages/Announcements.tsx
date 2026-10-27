import { Suspense, lazy, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronDown, Eye, Megaphone, Pencil, Pin, PinOff, Plus, Save, Search, Trash2, Users, X } from 'lucide-react'
import { api, errorMessage, supabase } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useMessaging } from '../lib/messagingContext'
import {
  deleteAnnouncement,
  fetchAnnouncementReaders,
  fetchAnnouncements,
  fetchMyAnnouncementReads,
  markAnnouncementsRead,
  postAnnouncement,
  setAnnouncementPinned,
  updateAnnouncement,
  type NewAnnouncement,
} from '../lib/announcements'
import type { Announcement, AnnouncementAudience, Project } from '../types'
import { ActionsMenu } from '../components/ActionsMenu'
import { Avatar } from '../components/Avatar'
import { Modal } from '../components/Modal'
import { ProgressRing } from '../components/ProgressRing'
import { Reveal } from '../components/Reveal'
import { Select } from '../components/Select'
import { loadRichTextFonts, renderRichText, richTextToPlain } from '../lib/richText'
import { alertDialog, confirmDialog } from '../lib/dialog'
import { usePageTitle } from '../lib/usePageTitle'

const MANAGER_ROLES = ['admin', 'lead']

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export function Announcements() {
  usePageTitle('Announcements')
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { usersById } = useMessaging()
  // For any fonts picked in the editor.
  useEffect(loadRichTextFonts, [])
  const isManager = Boolean(user && MANAGER_ROLES.includes(user.role))
  const isAdmin = user?.role === 'admin'
  const [composing, setComposing] = useState(false)
  const [editing, setEditing] = useState<Announcement | null>(null)
  const [readersFor, setReadersFor] = useState<Announcement | null>(null)

  const { data: announcements = [], isLoading, isError, error } = useQuery({
    queryKey: ['announcements'],
    queryFn: fetchAnnouncements,
    refetchInterval: 60_000,
  })

  // Read once when the page opens, before everything is marked seen, so what was new on arrival
  // keeps its "New" tag for the rest of the visit.
  const { data: seenOnArrival } = useQuery({
    queryKey: ['announcement-reads', 'on-arrival'],
    queryFn: fetchMyAnnouncementReads,
    staleTime: Infinity,
    gcTime: 0,
  })

  const markedRef = useRef(false)
  useEffect(() => {
    if (markedRef.current || !seenOnArrival || isLoading) return
    markedRef.current = true
    markAnnouncementsRead()
      .then(() => queryClient.invalidateQueries({ queryKey: ['announcements', 'unread-count'] }))
      .catch(() => {
        // Not fatal: they just stay unread until the next visit.
      })
  }, [seenOnArrival, isLoading, queryClient])

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => (await api.get<Project[]>('/projects')).data,
  })

  function audienceLabel(a: Announcement): string {
    if (a.audience === 'everyone') return 'Everyone'
    if (a.audience === 'team') {
      const lead = a.team_lead_id ? usersById.get(a.team_lead_id) : undefined
      return a.team_lead_id === user?.id ? 'Your team' : `${lead?.name ?? 'A lead'}'s team`
    }
    return `Project: ${projects.find((p) => p.id === a.project_id)?.name ?? 'a project'}`
  }

  const pinMutation = useMutation({
    mutationFn: ({ id, pinned }: { id: number; pinned: boolean }) => setAnnouncementPinned(id, pinned),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['announcements'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteAnnouncement,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['announcements'] }),
    onError: (err) => {
      queryClient.invalidateQueries({ queryKey: ['announcements'] })
      alertDialog(errorMessage(err, 'Could not delete the announcement.'))
    },
  })

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">Announcements</h1>
          <p className="text-sm text-gray-500">
            {isManager ? 'Post updates to your team, a project, or everyone.' : 'Updates from your lead and admins.'}
          </p>
        </div>
        {isManager && (
          <button
            onClick={() => setComposing(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
          >
            <Plus className="h-4 w-4" aria-hidden />
            New announcement
          </button>
        )}
      </div>

      {isLoading && <div className="text-gray-400">Loading...</div>}
      {isError && (
        <div className="rounded-xl border border-status-danger-text bg-status-danger-bg px-5 py-4 text-sm text-status-danger-text">
          Could not load announcements: {(error as Error).message}
        </div>
      )}
      {!isLoading && !isError && announcements.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-12 text-center text-sm text-gray-400">
          <Megaphone className="h-8 w-8 text-gray-300" />
          No announcements yet.
        </div>
      )}

      {announcements.length > 0 && (
        <Reveal as="ul" className="flex flex-col gap-3" step={40}>
          {announcements.map((a) => {
            const mine = a.author_id === user?.id
            const canManage = mine || isAdmin
            const isNew = !mine && seenOnArrival !== undefined && !seenOnArrival.has(a.id)
            return (
              <li
                key={a.id}
                className={`rounded-xl border bg-white p-5 ${a.pinned ? 'border-accent' : 'border-gray-200'}`}
              >
                <div className="mb-2 flex items-start gap-3">
                  <Avatar name={a.author?.name ?? 'Unknown'} photoUrl={a.author?.avatar_url} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-semibold text-gray-900">{a.title}</h2>
                      {a.pinned && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-accent-bg px-2 py-0.5 text-[11px] font-semibold text-accent-foreground">
                          <Pin className="h-3 w-3" />
                          Pinned
                        </span>
                      )}
                      {isNew && (
                        <span className="rounded-full bg-status-danger-text px-2 py-0.5 text-[11px] font-bold text-white">New</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400">
                      {a.author?.name ?? 'Unknown'} · {audienceLabel(a)} · {formatWhen(a.created_at)}
                    </div>
                  </div>
                  {canManage && (
                    <ActionsMenu
                      items={[
                        { label: 'Edit', icon: Pencil, onClick: () => setEditing(a) },
                        { label: a.pinned ? 'Unpin' : 'Pin to top', icon: a.pinned ? PinOff : Pin, onClick: () => pinMutation.mutate({ id: a.id, pinned: !a.pinned }) },
                        { label: 'Seen by…', icon: Eye, onClick: () => setReadersFor(a) },
                        {
                          label: 'Delete',
                          icon: Trash2,
                          variant: 'danger',
                          onClick: async () => {
                            if (await confirmDialog(`Delete "${a.title}"? Everyone it was sent to loses it too.`, { confirmLabel: 'Delete', danger: true })) deleteMutation.mutate(a.id)
                          },
                        },
                      ]}
                    />
                  )}
                </div>
                <AnnouncementBody body={a.body} title={a.title} />
              </li>
            )
          })}
        </Reveal>
      )}

      {(composing || editing) && user && (
        <ComposeAnnouncement
          key={editing?.id ?? 'new'}
          editing={editing}
          authorId={editing?.author_id ?? user.id}
          isAdmin={isAdmin}
          projects={projects}
          onClose={() => {
            setComposing(false)
            setEditing(null)
          }}
          onPosted={() => {
            setComposing(false)
            setEditing(null)
            queryClient.invalidateQueries({ queryKey: ['announcements'] })
          }}
        />
      )}

      {readersFor && <ReadersModal announcement={readersFor} onClose={() => setReadersFor(null)} />}
    </div>
  )
}

// Collapsed height of a body: about three lines of text.
const PREVIEW_HEIGHT = 72

// The first few lines of a body, fading out. Click it (or "Read more") to open the rest; a body
// short enough to fit shows in full with nothing to click.
function AnnouncementBody({ body, title }: { body: string; title: string }) {
  const content = useRef<HTMLDivElement>(null)
  const [fullHeight, setFullHeight] = useState(0)
  const [open, setOpen] = useState(false)
  const html = useMemo(() => renderRichText(body), [body])

  // Measured, and re-measured as the width or fonts change, so the open height is exact.
  useEffect(() => {
    const el = content.current
    if (!el) return
    const measure = () => setFullHeight(el.scrollHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [html])

  const long = fullHeight > PREVIEW_HEIGHT + 8
  const collapsed = long && !open

  return (
    <div>
      <div
        onClick={collapsed ? () => setOpen(true) : undefined}
        className={`relative overflow-hidden transition-[max-height] duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${collapsed ? 'cursor-pointer' : ''}`}
        style={{ maxHeight: !long ? undefined : open ? fullHeight : PREVIEW_HEIGHT }}
      >
        <div ref={content} className="rich-text wrap-break-word text-sm text-gray-700" dangerouslySetInnerHTML={{ __html: html }} />
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-linear-to-t from-white to-transparent transition-opacity duration-300 ${
            collapsed ? 'opacity-100' : 'opacity-0'
          }`}
        />
      </div>
      {long && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={`${open ? 'Show less of' : 'Read all of'} ${title}`}
          className="group mt-2 inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600 transition-colors hover:bg-accent-bg hover:text-accent-foreground"
        >
          {open ? 'Show less' : 'Read more'}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-300 ${open ? 'rotate-180' : 'group-hover:translate-y-0.5'}`} />
        </button>
      )}
    </div>
  )
}

// The editor is a large library only people writing an announcement need, so it loads on first use.
// Made once here: created inside the form, every keystroke would make a new component and remount it.
const RichTextEditor = lazy(() => import('../components/RichTextEditor').then((m) => ({ default: m.RichTextEditor })))

const fieldClass = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent'

// Writes a new announcement, or edits one when `editing` is given (everything but the author can change).
function ComposeAnnouncement({
  editing,
  authorId,
  isAdmin,
  projects,
  onClose,
  onPosted,
}: {
  editing: Announcement | null
  authorId: string
  isAdmin: boolean
  projects: Project[]
  onClose: () => void
  onPosted: () => void
}) {
  const { usersById } = useMessaging()
  const [audience, setAudience] = useState<AnnouncementAudience>(editing?.audience ?? (isAdmin ? 'everyone' : 'team'))
  const [teamLeadId, setTeamLeadId] = useState(editing?.team_lead_id ?? (isAdmin ? '' : authorId))
  const [projectId, setProjectId] = useState(editing?.project_id ? String(editing.project_id) : '')
  const [title, setTitle] = useState(editing?.title ?? '')
  const [body, setBody] = useState(editing?.body ?? '')
  // Characters of text, not markup: the formatting doesn't eat into the 4,000. When editing, a
  // close estimate until the first change, when the editor counts it exactly.
  const [textLength, setTextLength] = useState(() => (editing ? richTextToPlain(editing.body).length : 0))
  const tooLong = textLength > 4000
  const [pinned, setPinned] = useState(editing?.pinned ?? false)
  const [formError, setFormError] = useState<string | null>(null)

  // A lead posts only to projects they lead (the database enforces the same).
  const { data: myProjectIds } = useQuery({
    queryKey: ['project-leads-for-lead', authorId],
    queryFn: async () => {
      const { data, error } = await supabase.from('project_leads').select('project_id').eq('lead_id', authorId)
      if (error) throw error
      return data.map((row) => row.project_id as number)
    },
    enabled: !isAdmin,
  })
  const projectOptions = isAdmin ? projects : projects.filter((p) => myProjectIds?.includes(p.id))

  const leads = useMemo(
    () => [...usersById.values()].filter((u) => u.role === 'lead' && !u.is_bot).sort((a, b) => a.name.localeCompare(b.name)),
    [usersById],
  )

  const audienceOptions = [
    ...(isAdmin ? [{ value: 'everyone', label: 'Everyone' }] : []),
    { value: 'team', label: isAdmin ? "A lead's team" : 'My team' },
    { value: 'project', label: 'A project', disabled: projectOptions.length === 0 },
  ]

  const postMutation = useMutation({
    mutationFn: (input: NewAnnouncement) => (editing ? updateAnnouncement(editing.id, input) : postAnnouncement(authorId, input)),
    onSuccess: onPosted,
    onError: (err) => setFormError(errorMessage(err, editing ? 'Could not save your changes.' : 'Could not post the announcement.')),
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (audience === 'team' && !teamLeadId) return setFormError('Choose whose team this is for.')
    if (audience === 'project' && !projectId) return setFormError('Choose a project.')
    setFormError(null)
    postMutation.mutate({
      audience,
      team_lead_id: audience === 'team' ? teamLeadId : null,
      project_id: audience === 'project' ? Number(projectId) : null,
      title: title.trim(),
      body: body.trim(),
      pinned,
    })
  }

  return (
    <Modal title={editing ? 'Edit announcement' : 'New announcement'} onClose={onClose} maxWidthClassName="max-w-xl">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Send to</label>
            <Select
              value={audience}
              onChange={(value) => setAudience(value as AnnouncementAudience)}
              options={audienceOptions}
              fullWidth
              className={fieldClass}
            />
          </div>
          {audience === 'team' && isAdmin && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Team</label>
              <Select
                value={teamLeadId}
                onChange={setTeamLeadId}
                placeholder="Choose a lead..."
                options={leads.map((l) => ({ value: l.id, label: `${l.name}'s team` }))}
                fullWidth
                className={fieldClass}
              />
            </div>
          )}
          {audience === 'project' && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Project</label>
              <Select
                value={projectId}
                onChange={setProjectId}
                placeholder="Choose a project..."
                options={projectOptions.map((p) => ({ value: String(p.id), label: p.name }))}
                fullWidth
                className={fieldClass}
              />
            </div>
          )}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Title</label>
          <input required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} className={fieldClass} />
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="block text-sm font-medium text-gray-700">Message</span>
            <span className={`text-xs ${tooLong ? 'font-semibold text-status-danger-text' : 'text-gray-400'}`}>{textLength}/4000</span>
          </div>
          <Suspense fallback={<div className="h-52 rounded-lg border border-gray-200" />}>
            <RichTextEditor
              value={body}
              onChange={(html, length) => {
                setBody(html)
                setTextLength(length)
              }}
              aria-label="Message"
            />
          </Suspense>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
          Pin to the top
        </label>
        {formError && <div className="rounded-lg bg-status-danger-text px-3 py-2 text-sm text-status-danger-bg">{formError}</div>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600">
            <X className="h-4 w-4" aria-hidden />
            Cancel
          </button>
          <button
            type="submit"
            disabled={postMutation.isPending || !title.trim() || !body.trim() || tooLong}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
          >
            {editing ? <Save className="h-4 w-4" aria-hidden /> : <Megaphone className="h-4 w-4" aria-hidden />}
            {postMutation.isPending ? (editing ? 'Saving...' : 'Posting...') : editing ? 'Save changes' : 'Post'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

type ReaderFilter = 'all' | 'seen' | 'unseen'

// "just now", "5m ago", "3h ago", "2d ago", then the date.
function timeAgo(iso: string) {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}h ago`
  if (minutes < 7 * 24 * 60) return `${Math.floor(minutes / (24 * 60))}d ago`
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' })
}

// Who an announcement reached: a ring for how much of its audience has seen it, the latest few
// faces, then everyone, filterable by seen / not yet and searchable once the list is long.
function ReadersModal({ announcement, onClose }: { announcement: Announcement; onClose: () => void }) {
  const { data: readers = [], isLoading } = useQuery({
    queryKey: ['announcement-readers', announcement.id],
    queryFn: () => fetchAnnouncementReaders(announcement.id),
  })
  const [filter, setFilter] = useState<ReaderFilter>('all')
  const [search, setSearch] = useState('')

  // Seen first, most recent at the top; then those who haven't, A–Z.
  const sorted = useMemo(
    () =>
      [...readers].sort((a, b) =>
        a.read_at && b.read_at ? b.read_at.localeCompare(a.read_at) : a.read_at ? -1 : b.read_at ? 1 : a.name.localeCompare(b.name),
      ),
    [readers],
  )
  const seen = sorted.filter((r) => r.read_at)
  const unseenCount = sorted.length - seen.length
  const term = search.trim().toLowerCase()
  const shown = sorted.filter(
    (r) => (filter === 'all' || (filter === 'seen') === Boolean(r.read_at)) && (!term || r.name.toLowerCase().includes(term)),
  )

  const tabs: { value: ReaderFilter; label: string; count: number }[] = [
    { value: 'all', label: 'All', count: sorted.length },
    { value: 'seen', label: 'Seen', count: seen.length },
    { value: 'unseen', label: 'Not yet', count: unseenCount },
  ]
  const tabIndex = tabs.findIndex((t) => t.value === filter)

  return (
    <Modal title="Seen by" onClose={onClose}>
      {isLoading ? (
        <div className="flex flex-col items-center gap-3 py-8">
          <div className="h-24 w-24 animate-pulse rounded-full bg-gray-100" />
          <div className="h-3 w-40 animate-pulse rounded bg-gray-100" />
        </div>
      ) : readers.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-gray-400">
          <Users className="h-8 w-8 text-gray-300" />
          Nobody is in this announcement's audience yet.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-4 rounded-xl bg-gray-50 p-3">
            <ProgressRing value={seen.length / sorted.length} size={92} strokeWidth={8} label="seen" sublabel={`${seen.length} of ${sorted.length}`} />
            <div className="min-w-0 flex-1">
              <div className="line-clamp-2 text-sm font-semibold text-gray-900">{announcement.title}</div>
              {seen.length > 0 ? (
                <>
                  <div className="mt-2 flex -space-x-2">
                    {seen.slice(0, 5).map((r, i) => (
                      <span
                        key={r.user_id}
                        title={r.name}
                        className="rounded-full ring-2 ring-gray-50 transition-transform hover:z-10 hover:-translate-y-1"
                        style={{ zIndex: 5 - i }}
                      >
                        <Avatar name={r.name} photoUrl={r.avatar_url} size={26} />
                      </span>
                    ))}
                    {seen.length > 5 && (
                      <span className="flex h-[26px] min-w-[26px] items-center justify-center rounded-full bg-gray-200 px-1.5 text-[10px] font-semibold text-gray-600 ring-2 ring-gray-50">
                        +{seen.length - 5}
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 text-xs text-gray-500">Last seen {timeAgo(seen[0].read_at!)}</div>
                </>
              ) : (
                <div className="mt-1 text-xs text-gray-500">Nobody has opened it yet.</div>
              )}
            </div>
          </div>

          <div role="tablist" aria-label="Show" className="relative grid grid-cols-3 rounded-lg bg-gray-100 p-1">
            <span
              aria-hidden
              className="absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/3)] rounded-md bg-white shadow-sm transition-transform duration-300 ease-out"
              style={{ transform: `translateX(${tabIndex * 100}%)` }}
            />
            {tabs.map((t) => (
              <button
                key={t.value}
                type="button"
                role="tab"
                aria-selected={filter === t.value}
                onClick={() => setFilter(t.value)}
                className={`relative flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium transition-colors ${
                  filter === t.value ? 'text-gray-900' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.label}
                <span
                  className={`rounded-full px-1.5 text-[10px] font-semibold ${
                    t.value === 'seen'
                      ? 'bg-status-success-bg text-status-success-text'
                      : t.value === 'unseen'
                        ? 'bg-status-warning-bg text-status-warning-text'
                        : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {t.count}
                </span>
              </button>
            ))}
          </div>

          {sorted.length > 8 && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Find someone..."
                aria-label="Find someone"
                className="w-full rounded-lg border border-gray-200 py-2 pl-8 pr-3 text-sm outline-none focus:border-accent"
              />
            </div>
          )}

          {shown.length === 0 ? (
            <div className="py-6 text-center text-sm text-gray-400">
              {term ? 'No one by that name.' : filter === 'unseen' ? 'Everyone has seen it. 🎉' : 'Nobody has seen it yet.'}
            </div>
          ) : (
            <Reveal key={filter + term} as="ul" className="-mx-1 max-h-[45vh] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" step={25}>
              {shown.map((r) => (
                <li key={r.user_id} className="flex items-center gap-3 rounded-lg px-1 py-2 hover:bg-gray-50">
                  <div className={`relative shrink-0 ${r.read_at ? '' : 'opacity-50 grayscale'}`}>
                    <Avatar name={r.name} photoUrl={r.avatar_url} size={32} />
                    {r.read_at && (
                      <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-status-success-text ring-2 ring-white">
                        <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
                      </span>
                    )}
                  </div>
                  <span className={`min-w-0 flex-1 truncate text-sm ${r.read_at ? 'text-gray-800' : 'text-gray-500'}`}>{r.name}</span>
                  {r.read_at ? (
                    <span title={formatWhen(r.read_at)} className="inline-flex shrink-0 items-center gap-1 text-xs text-status-success-text">
                      <Eye className="h-3.5 w-3.5" />
                      {timeAgo(r.read_at)}
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500">Not yet</span>
                  )}
                </li>
              ))}
            </Reveal>
          )}
        </div>
      )}
    </Modal>
  )
}
