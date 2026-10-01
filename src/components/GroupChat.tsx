import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Check, Settings, Users } from 'lucide-react'
import { api, errorMessage, supabase } from '../lib/api'
import { useAuth } from '../lib/auth'
import { convertEmoticons } from '../lib/emoticons'
import {
  addGroupMembers,
  createGroup,
  deleteGroup,
  fetchGroupPage,
  GROUP_PAGE_SIZE,
  markGroupRead,
  removeGroupMember,
  renameGroup,
  sendGroupMessage,
} from '../lib/groupChats'
import { useMessaging } from '../lib/messagingContext'
import { formatTime } from '../lib/week'
import type { ChatGroupSummary, GroupMessage, Project } from '../types'
import { Avatar } from './Avatar'
import { EmojiPickerButton } from './EmojiPickerButton'
import { Modal } from './Modal'
import { confirmDialog } from '../lib/dialog'

// Messenger's send-bubble blue, as in MessageBubble.tsx.
const BUBBLE_BLUE = '#0084ff'

// A group's messages, a page at a time, under the ['group-chats', myId] prefix so the realtime
// insert and every group mutation refresh it (same shape as useThread for direct messages).
function useGroupThread(myId: string | null, groupId: number | null) {
  const query = useInfiniteQuery({
    queryKey: ['group-chats', myId, 'thread', groupId],
    queryFn: ({ pageParam }) => fetchGroupPage(groupId!, pageParam),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => (lastPage.length < GROUP_PAGE_SIZE ? undefined : lastPage[lastPage.length - 1].id),
    enabled: Boolean(myId && groupId),
    refetchInterval: 15000,
  })
  const messages = useMemo<GroupMessage[]>(() => (query.data ? query.data.pages.flat().reverse() : []), [query.data])

  const scrollRef = useRef<HTMLDivElement>(null)
  const distanceFromBottom = useRef<number | null>(null)
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el && distanceFromBottom.current !== null) {
      el.scrollTop = el.scrollHeight - distanceFromBottom.current
      distanceFromBottom.current = null
    }
  }, [messages.length])

  function loadOlder() {
    const el = scrollRef.current
    if (el) distanceFromBottom.current = el.scrollHeight - el.scrollTop
    return query.fetchNextPage()
  }

  return {
    messages,
    isLoading: query.isLoading,
    hasOlder: Boolean(query.hasNextPage),
    loadingOlder: query.isFetchingNextPage,
    loadOlder,
    scrollRef,
  }
}

export function GroupChatPane({ group, onBack, onGone }: { group: ChatGroupSummary; onBack: () => void; onGone: () => void }) {
  const { myId } = useMessaging()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState('')
  const [sendError, setSendError] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const threadEndRef = useRef<HTMLDivElement>(null)
  const { messages, isLoading, hasOlder, loadingOlder, loadOlder, scrollRef } = useGroupThread(myId, group.id)
  const membersById = useMemo(() => new Map(group.members.map((m) => [m.id, m])), [group.members])

  useEffect(() => {
    if (group.unread_count > 0) {
      markGroupRead(group.id).then(() => queryClient.invalidateQueries({ queryKey: ['group-chats', myId] }))
    }
  }, [group.id, group.unread_count, myId, queryClient])

  const newestId = messages[messages.length - 1]?.id
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: 'nearest' })
  }, [group.id, newestId])

  const sendMutation = useMutation({
    mutationFn: (text: string) => sendGroupMessage(group.id, myId!, text),
    onSuccess: (_data, sent) => {
      setDraft((d) => (d.trim() === sent ? '' : d))
      setSendError(null)
      queryClient.invalidateQueries({ queryKey: ['group-chats', myId] })
    },
    onError: (error) => {
      setSendError(errorMessage(error, 'Could not send your message.'))
      setTimeout(() => setSendError(null), 6000)
    },
  })

  function handleSend(e: FormEvent) {
    e.preventDefault()
    if (!draft.trim() || sendMutation.isPending) return
    sendMutation.mutate(draft.trim())
  }

  return (
    <>
      <div className="flex items-center gap-3 border-b border-gray-100 px-3 py-3 sm:px-5">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to conversations"
          className="-ml-1 shrink-0 rounded-md p-1 text-gray-500 hover:bg-gray-100 md:hidden"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <GroupIcon size={36} />
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-semibold text-gray-900">{group.name}</span>
          <span className="truncate text-xs text-gray-400">
            {group.members.length} members · {group.members.slice(0, 4).map((m) => m.name.split(' ')[0]).join(', ')}
            {group.members.length > 4 ? '…' : ''}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          aria-label="Group settings"
          className="ml-auto flex h-9 w-9 items-center justify-center rounded-full text-violet-500 hover:bg-violet-50"
        >
          <Settings className="h-5 w-5" />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 sm:px-5">
        {hasOlder && (
          <button
            type="button"
            onClick={loadOlder}
            disabled={loadingOlder}
            className="mx-auto mb-3 block rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
          >
            {loadingOlder ? 'Loading...' : 'Load earlier messages'}
          </button>
        )}
        {messages.length === 0 && !isLoading && (
          <div className="flex h-full items-center justify-center text-sm text-gray-400">Say hello to the group.</div>
        )}
        <div className="flex flex-col gap-2">
          {messages.map((m, index) => {
            const mine = m.sender_id === myId
            const sender = membersById.get(m.sender_id)
            // Name and photo once per run of messages from the same person.
            const firstOfRun = index === 0 || messages[index - 1].sender_id !== m.sender_id
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`flex max-w-lg items-end gap-1.5 ${mine ? 'flex-row-reverse' : ''}`}>
                  {!mine && (
                    <div className="w-6 shrink-0">
                      {firstOfRun && <Avatar name={sender?.name ?? 'Former member'} photoUrl={sender?.avatar_url} size={24} />}
                    </div>
                  )}
                  <div className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                    {!mine && firstOfRun && (
                      <span className="mb-0.5 px-2 text-[11px] text-gray-400">{sender?.name ?? 'Former member'}</span>
                    )}
                    <div
                      title={formatTime(m.created_at)}
                      style={mine ? { backgroundColor: BUBBLE_BLUE } : undefined}
                      className={`rounded-3xl px-3.5 py-2 text-sm ${mine ? 'text-white' : 'bg-gray-100 text-gray-800'}`}
                    >
                      <div className="whitespace-pre-wrap wrap-break-word">{convertEmoticons(m.body)}</div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        <div ref={threadEndRef} />
      </div>

      {sendError && (
        <div role="alert" className="px-4 pb-1 pt-2 text-xs text-status-danger-text">
          {sendError}
        </div>
      )}
      <form onSubmit={handleSend} className="flex items-center gap-2 border-t border-gray-100 p-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`Message ${group.name}`}
          maxLength={2000}
          className="flex-1 rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-sm outline-none focus:border-accent"
        />
        <EmojiPickerButton onSelect={(emoji) => setDraft((d) => d + emoji)} />
        <button
          type="submit"
          disabled={!draft.trim() || sendMutation.isPending}
          style={{ backgroundColor: BUBBLE_BLUE }}
          className="rounded-full px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Send
        </button>
      </form>

      {settingsOpen && <GroupSettingsModal group={group} onClose={() => setSettingsOpen(false)} onGone={onGone} />}
    </>
  )
}

export function GroupIcon({ size = 36 }: { size?: number }) {
  return (
    <span
      style={{ width: size, height: size }}
      className="flex shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-600"
    >
      <Users style={{ width: size / 2, height: size / 2 }} />
    </span>
  )
}

// Who can be put in a group: anyone in the directory except bots and the caller. Leads and admins
// see everyone there; the quick-fill buttons add a whole team or project in one go.
function MemberPicker({
  selected,
  onChange,
  excludeIds = [],
}: {
  selected: Set<string>
  onChange: (next: Set<string>) => void
  excludeIds?: string[]
}) {
  const { user } = useAuth()
  const { usersById, myId } = useMessaging()
  const [search, setSearch] = useState('')
  const isAdmin = user?.role === 'admin'

  const candidates = useMemo(
    () =>
      [...usersById.values()]
        .filter((u) => !u.is_bot && u.id !== myId && !excludeIds.includes(u.id))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [usersById, myId, excludeIds],
  )

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => (await api.get<Project[]>('/projects')).data,
  })
  const { data: projectLeads = [] } = useQuery({
    queryKey: ['project-leads-all'],
    queryFn: async () => {
      const { data, error } = await supabase.from('project_leads').select('project_id, lead_id')
      if (error) throw error
      return data as { project_id: number; lead_id: string }[]
    },
  })

  const candidateIds = new Set(candidates.map((c) => c.id))
  const teamOf = (leadId: string) => candidates.filter((c) => c.id === leadId || c.lead_id === leadId).map((c) => c.id)
  const projectMembers = (projectId: number) => {
    const leads = projectLeads.filter((pl) => pl.project_id === projectId).map((pl) => pl.lead_id)
    return candidates.filter((c) => leads.includes(c.id) || (c.lead_id !== null && leads.includes(c.lead_id))).map((c) => c.id)
  }
  const presets = [
    ...(user?.role === 'lead' ? [{ label: 'My team', ids: teamOf(user.id) }] : []),
    ...(isAdmin
      ? candidates.filter((c) => c.role === 'lead').map((lead) => ({ label: `${lead.name.split(' ')[0]}'s team`, ids: teamOf(lead.id) }))
      : []),
    ...projects.map((p) => ({ label: p.name, ids: projectMembers(p.id) })),
  ].filter((preset) => preset.ids.length > 0)

  function addAll(ids: string[]) {
    onChange(new Set([...selected, ...ids.filter((id) => candidateIds.has(id))]))
  }

  function toggle(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange(next)
  }

  const term = search.trim().toLowerCase()
  const shown = term ? candidates.filter((c) => c.name.toLowerCase().includes(term)) : candidates

  return (
    <div className="flex flex-col gap-2">
      {presets.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <span className="self-center text-xs text-gray-400">Add all of:</span>
          {presets.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => addAll(preset.ids)}
              className="rounded-full border border-gray-200 px-2.5 py-0.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              {preset.label} ({preset.ids.length})
            </button>
          ))}
        </div>
      )}
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search people..."
        className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent"
      />
      <ul className="max-h-64 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200">
        {shown.length === 0 && <li className="px-3 py-4 text-center text-sm text-gray-400">No matching people.</li>}
        {shown.map((c) => {
          const on = selected.has(c.id)
          return (
            <li key={c.id}>
              <button type="button" onClick={() => toggle(c.id)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-gray-50">
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${on ? 'border-accent bg-accent text-accent-foreground' : 'border-gray-300 text-transparent'}`}
                >
                  <Check className="h-3 w-3" />
                </span>
                <Avatar name={c.name} photoUrl={c.avatar_url} size={24} />
                <span className="flex-1 truncate text-sm text-gray-800">{c.name}</span>
                <span className="text-xs capitalize text-gray-400">{c.role}</span>
              </button>
            </li>
          )
        })}
      </ul>
      <div className="text-xs text-gray-400">{selected.size} selected</div>
    </div>
  )
}

export function NewGroupModal({ onClose, onCreated }: { onClose: () => void; onCreated: (groupId: number) => void }) {
  const { myId } = useMessaging()
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [formError, setFormError] = useState<string | null>(null)

  const createMutation = useMutation({
    mutationFn: () => createGroup(name.trim(), [...selected]),
    onSuccess: async (groupId) => {
      await queryClient.invalidateQueries({ queryKey: ['group-chats', myId] })
      onCreated(groupId)
    },
    onError: (err) => setFormError(errorMessage(err, 'Could not create the group.')),
  })

  return (
    <Modal title="New group chat" onClose={onClose} maxWidthClassName="max-w-lg">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim() && selected.size > 0) createMutation.mutate()
        }}
        className="flex flex-col gap-4"
      >
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Group name</label>
          <input
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Team Owls, or a project name"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Members</label>
          <MemberPicker selected={selected} onChange={setSelected} />
        </div>
        {formError && <div className="rounded-lg bg-status-danger-text px-3 py-2 text-sm text-status-danger-bg">{formError}</div>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600">
            Cancel
          </button>
          <button
            type="submit"
            disabled={!name.trim() || selected.size === 0 || createMutation.isPending}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
          >
            {createMutation.isPending ? 'Creating...' : 'Create group'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function GroupSettingsModal({ group, onClose, onGone }: { group: ChatGroupSummary; onClose: () => void; onGone: () => void }) {
  const { user } = useAuth()
  const { myId } = useMessaging()
  const queryClient = useQueryClient()
  // Admins manage any group they're in, as the database allows (can_manage_group()).
  const canManage = group.my_role === 'owner' || user?.role === 'admin'
  const [name, setName] = useState(group.name)
  const [adding, setAdding] = useState<Set<string> | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['group-chats', myId] })
  const onError = (err: unknown) => setActionError(errorMessage(err, 'That did not work.'))

  const renameMutation = useMutation({ mutationFn: () => renameGroup(group.id, name.trim()), onSuccess: refresh, onError })
  const addMutation = useMutation({
    mutationFn: (ids: string[]) => addGroupMembers(group.id, ids),
    onSuccess: () => {
      setAdding(null)
      refresh()
    },
    onError,
  })
  const removeMutation = useMutation({
    mutationFn: (userId: string) => removeGroupMember(group.id, userId),
    onSuccess: (_data, userId) => {
      refresh()
      if (userId === myId) {
        onClose()
        onGone()
      }
    },
    onError,
  })
  const deleteMutation = useMutation({
    mutationFn: () => deleteGroup(group.id),
    onSuccess: () => {
      refresh()
      onClose()
      onGone()
    },
    onError,
  })

  return (
    <Modal title="Group settings" onClose={onClose} maxWidthClassName="max-w-lg">
      <div className="flex flex-col gap-5">
        {canManage && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (name.trim() && name.trim() !== group.name) renameMutation.mutate()
            }}
            className="flex items-end gap-2"
          >
            <div className="flex-1">
              <label className="mb-1 block text-sm font-medium text-gray-700">Name</label>
              <input
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </div>
            <button
              type="submit"
              disabled={!name.trim() || name.trim() === group.name || renameMutation.isPending}
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Rename
            </button>
          </form>
        )}

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">{group.members.length} members</span>
            {canManage && adding === null && (
              <button type="button" onClick={() => setAdding(new Set())} className="text-xs font-semibold text-sky-700 hover:underline">
                + Add people
              </button>
            )}
          </div>
          {adding !== null ? (
            <div className="flex flex-col gap-2">
              <MemberPicker selected={adding} onChange={setAdding} excludeIds={group.members.map((m) => m.id)} />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setAdding(null)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => addMutation.mutate([...adding])}
                  disabled={adding.size === 0 || addMutation.isPending}
                  className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-foreground disabled:opacity-50"
                >
                  Add {adding.size || ''}
                </button>
              </div>
            </div>
          ) : (
            <ul className="max-h-64 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200">
              {group.members.map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-3 py-2">
                  <Avatar name={m.name} photoUrl={m.avatar_url} size={24} />
                  <span className="flex-1 truncate text-sm text-gray-800">
                    {m.name}
                    {m.id === myId && <span className="ml-1 text-xs text-gray-400">(you)</span>}
                  </span>
                  {m.role === 'owner' && <span className="text-xs font-medium text-violet-600">Owner</span>}
                  {canManage && m.id !== myId && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (await confirmDialog(`Remove ${m.name} from ${group.name}?`, { confirmLabel: 'Remove', danger: true })) removeMutation.mutate(m.id)
                      }}
                      className="text-xs font-medium text-status-danger-text hover:underline"
                    >
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {actionError && <div className="rounded-lg bg-status-danger-text px-3 py-2 text-sm text-status-danger-bg">{actionError}</div>}

        <div className="flex flex-wrap justify-end gap-2 border-t border-gray-100 pt-4">
          <button
            type="button"
            onClick={async () => {
              if (await confirmDialog(`Leave ${group.name}? You'll stop getting its messages.`, { confirmLabel: 'Leave', danger: true })) removeMutation.mutate(myId!)
            }}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Leave group
          </button>
          {canManage && (
            <button
              type="button"
              onClick={async () => {
                if (await confirmDialog(`Delete ${group.name} and all its messages for everyone? This cannot be undone.`, { confirmLabel: 'Delete', danger: true })) deleteMutation.mutate()
              }}
              className="rounded-lg bg-status-danger-text px-4 py-2 text-sm font-semibold text-white"
            >
              Delete group
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}
