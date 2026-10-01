import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, Megaphone, Pin } from 'lucide-react'
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
  type NewAnnouncement,
} from '../lib/announcements'
import type { Announcement, AnnouncementAudience, Project } from '../types'
import { ActionsMenu } from '../components/ActionsMenu'
import { Avatar } from '../components/Avatar'
import { Modal } from '../components/Modal'
import { Reveal } from '../components/Reveal'
import { Select } from '../components/Select'
import { confirmDialog } from '../lib/dialog'

const MANAGER_ROLES = ['admin', 'lead']

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export function Announcements() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { usersById } = useMessaging()
  const isManager = Boolean(user && MANAGER_ROLES.includes(user.role))
  const isAdmin = user?.role === 'admin'
  const [composing, setComposing] = useState(false)
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
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
          >
            + New announcement
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
                        { label: a.pinned ? 'Unpin' : 'Pin to top', onClick: () => pinMutation.mutate({ id: a.id, pinned: !a.pinned }) },
                        { label: 'Seen by…', onClick: () => setReadersFor(a) },
                        {
                          label: 'Delete',
                          variant: 'danger',
                          onClick: async () => {
                            if (await confirmDialog(`Delete "${a.title}"? Everyone it was sent to loses it too.`, { confirmLabel: 'Delete', danger: true })) deleteMutation.mutate(a.id)
                          },
                        },
                      ]}
                    />
                  )}
                </div>
                <p className="whitespace-pre-wrap wrap-break-word text-sm text-gray-700">{a.body}</p>
              </li>
            )
          })}
        </Reveal>
      )}

      {composing && user && (
        <ComposeAnnouncement
          authorId={user.id}
          isAdmin={isAdmin}
          projects={projects}
          onClose={() => setComposing(false)}
          onPosted={() => {
            setComposing(false)
            queryClient.invalidateQueries({ queryKey: ['announcements'] })
          }}
        />
      )}

      {readersFor && <ReadersModal announcement={readersFor} onClose={() => setReadersFor(null)} />}
    </div>
  )
}

function ComposeAnnouncement({
  authorId,
  isAdmin,
  projects,
  onClose,
  onPosted,
}: {
  authorId: string
  isAdmin: boolean
  projects: Project[]
  onClose: () => void
  onPosted: () => void
}) {
  const { usersById } = useMessaging()
  const [audience, setAudience] = useState<AnnouncementAudience>(isAdmin ? 'everyone' : 'team')
  const [teamLeadId, setTeamLeadId] = useState(isAdmin ? '' : authorId)
  const [projectId, setProjectId] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [pinned, setPinned] = useState(false)
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
    mutationFn: (input: NewAnnouncement) => postAnnouncement(authorId, input),
    onSuccess: onPosted,
    onError: (err) => setFormError(errorMessage(err, 'Could not post the announcement.')),
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

  const fieldClass = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent'

  return (
    <Modal title="New announcement" onClose={onClose} maxWidthClassName="max-w-xl">
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
            <label className="block text-sm font-medium text-gray-700">Message</label>
            <span className="text-xs text-gray-400">{body.length}/4000</span>
          </div>
          <textarea
            required
            rows={6}
            maxLength={4000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className={`${fieldClass} resize-y`}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
          Pin to the top
        </label>
        {formError && <div className="rounded-lg bg-status-danger-text px-3 py-2 text-sm text-status-danger-bg">{formError}</div>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600">
            Cancel
          </button>
          <button
            type="submit"
            disabled={postMutation.isPending || !title.trim() || !body.trim()}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
          >
            {postMutation.isPending ? 'Posting...' : 'Post'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function ReadersModal({ announcement, onClose }: { announcement: Announcement; onClose: () => void }) {
  const { data: readers = [], isLoading } = useQuery({
    queryKey: ['announcement-readers', announcement.id],
    queryFn: () => fetchAnnouncementReaders(announcement.id),
  })
  const seen = readers.filter((r) => r.read_at)

  return (
    <Modal title={`Seen by ${seen.length} of ${readers.length}`} onClose={onClose}>
      {isLoading ? (
        <div className="text-sm text-gray-400">Loading...</div>
      ) : readers.length === 0 ? (
        <div className="text-sm text-gray-400">Nobody is in this announcement's audience yet.</div>
      ) : (
        <ul className="max-h-[60vh] divide-y divide-gray-100 overflow-y-auto">
          {readers.map((r) => (
            <li key={r.user_id} className="flex items-center gap-3 py-2.5">
              <Avatar name={r.name} photoUrl={r.avatar_url} size={28} />
              <span className="flex-1 truncate text-sm text-gray-800">{r.name}</span>
              {r.read_at ? (
                <span className="inline-flex items-center gap-1 text-xs text-status-success-text">
                  <Eye className="h-3.5 w-3.5" />
                  {formatWhen(r.read_at)}
                </span>
              ) : (
                <span className="text-xs text-gray-400">Not yet</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
