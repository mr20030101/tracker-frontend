import { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './api'
import { useAuth } from './auth'
import { buildConversations, fetchConversationSummaries, fetchDirectory } from './messages'
import { fetchGroupSummaries } from './groupChats'
import { MESSAGE_NOTIFICATION_SOUND, playSound } from './sound'
import { botMessageRevealAt } from './useBotTyping'
import type { ChatGroupSummary, Conversation, DirectoryUser } from '../types'

interface MessagingContextValue {
  isOpen: boolean
  activeUserId: string | null
  activeUserName: string | null
  openInbox: () => void
  openChatWith: (userId: string, name: string) => void
  close: () => void
  myId: string | null
  usersById: Map<string, DirectoryUser>
  conversations: Conversation[]
  // Group chats the caller is in, most recently active first.
  groups: ChatGroupSummary[]
  groupsLoaded: boolean
  // Direct and group messages together.
  totalUnread: number
}

const MessagingContext = createContext<MessagingContextValue | null>(null)

// When this tab opened, less some leeway for the server's clock being ahead of this one.
const OPENED_AT = Date.now()
const CLOCK_LEEWAY_MS = 2 * 60 * 1000

/** Sent after this tab opened, so it can be news here (older messages were already waiting). */
function isFresh(createdAt: string): boolean {
  return Date.parse(createdAt) >= OPENED_AT - CLOCK_LEEWAY_MS
}

export function MessagingProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const myId = user?.id ?? null
  const queryClient = useQueryClient()

  const [isOpen, setIsOpen] = useState(false)
  const [activeUserId, setActiveUserId] = useState<string | null>(null)
  const [activeUserName, setActiveUserName] = useState<string | null>(null)

  // Only the inbox summaries live here, never whole threads (those load per chat, see useThread).
  // `recentMessages` is each conversation's last few messages: enough for the list previews, the
  // unread badge, the bot reveal timing and the notification sound.
  const { data: summaries = [], isSuccess: messagesLoaded } = useQuery({
    queryKey: ['messages', myId, 'summary'],
    queryFn: fetchConversationSummaries,
    enabled: Boolean(myId),
    refetchInterval: 15000,
  })
  const recentMessages = useMemo(() => summaries.flatMap((s) => s.recent), [summaries])

  const { data: directory = [] } = useQuery({
    queryKey: ['directory'],
    queryFn: fetchDirectory,
    enabled: Boolean(myId),
    staleTime: 60_000,
  })

  const usersById = useMemo(() => new Map(directory.map((d) => [d.id, d])), [directory])

  // A bot reply's bubble is held back behind a "typing…" indicator until its reveal time (see
  // useBotTyping) — without this same filter here, the conversation list preview and unread badge
  // would show its text the instant it lands in the DB, well before the open chat panel reveals it.
  // `revealTick` has no value of its own; it's a dependency purely to force this memo to recompute
  // once the scheduled reveal timer below fires, since `recentMessages`/`usersById` won't have changed.
  const [revealTick, forceRevealTick] = useReducer((c: number) => c + 1, 0)
  const visibleMessages = useMemo(() => {
    const now = Date.now()
    return recentMessages.filter((m) => !usersById.get(m.sender_id)?.is_bot || botMessageRevealAt(m, recentMessages) <= now)
  }, [recentMessages, usersById, revealTick])
  useEffect(() => {
    const now = Date.now()
    const nextReveal = recentMessages
      .filter((m) => usersById.get(m.sender_id)?.is_bot)
      .map((m) => botMessageRevealAt(m, recentMessages))
      .filter((t) => t > now)
      .reduce((min: number | null, t) => (min === null || t < min ? t : min), null)
    if (nextReveal === null) return
    const timer = setTimeout(forceRevealTick, nextReveal - now)
    return () => clearTimeout(timer)
  }, [recentMessages, usersById])

  // The database's unread counts, less any bot replies still held back behind the typing indicator
  // (those are in the counts but not yet shown).
  const unreadByOther = useMemo(() => {
    const visibleIds = new Set(visibleMessages.map((m) => m.id))
    return new Map(
      summaries.map((s) => {
        const held = s.recent.filter((m) => m.recipient_id === myId && !m.read_at && !visibleIds.has(m.id)).length
        return [s.other_user_id, Math.max(0, s.unread_count - held)] as const
      }),
    )
  }, [summaries, visibleMessages, myId])

  const conversations = useMemo(
    () => (myId ? buildConversations(myId, visibleMessages, usersById, unreadByOther) : []),
    [myId, visibleMessages, usersById, unreadByOther],
  )
  const { data: groups = [], isSuccess: groupsLoaded } = useQuery({
    queryKey: ['group-chats', myId],
    queryFn: fetchGroupSummaries,
    enabled: Boolean(myId),
    refetchInterval: 15000,
  })

  const totalUnread =
    conversations.reduce((sum, c) => sum + c.unreadCount, 0) + groups.reduce((sum, g) => sum + g.unread_count, 0)

  // The same once-per-message sound for group chats, keyed on each group's newest message. The map
  // only ever grows: a group missing from one refetch (or the whole list coming back empty) mustn't
  // make its existing messages count as new when it reappears.
  const groupTailRef = useRef<Map<number, number> | null>(null)
  useEffect(() => {
    if (!groupsLoaded || !myId) return
    const seeded = groupTailRef.current !== null
    const tails = groupTailRef.current ?? new Map<number, number>()
    let play = false
    for (const g of groups) {
      const last = g.last_message
      if (!last) continue
      const seen = tails.get(g.id) ?? 0
      if (last.id <= seen) continue
      tails.set(g.id, last.id)
      if (seeded && last.sender_id !== myId && g.unread_count > 0 && isFresh(last.created_at)) play = true
    }
    groupTailRef.current = tails
    if (play) playSound(MESSAGE_NOTIFICATION_SOUND)
  }, [groups, groupsLoaded, myId])

  // Plays the notification sound exactly once per message, the moment it actually becomes visible
  // in `visibleMessages` — whether that's the instant a human's message arrives (immediately
  // visible) or whenever a bot reply's reveal timer fires (see above). Driving the sound off this
  // same visibility set, instead of a separate delay computed straight off the raw realtime payload,
  // is what keeps it from firing once early (on insert) and again later (on reveal): there's only
  // one place a message can be judged "newly visible" now. `null` (vs. an empty Set) marks that the
  // baseline hasn't been seeded yet, so the very first load doesn't play a sound for every message
  // already in history.
  //
  // The set of seen ids only ever grows. The inbox holds just each conversation's last few messages,
  // so deleting one lets an older message slide back in, and a refetch can briefly come back empty;
  // neither is a new message, and neither should ring. `isFresh` also skips anything sent before this
  // tab opened, in case the very first load was empty.
  const seenMessageIdsRef = useRef<Set<number> | null>(null)
  useEffect(() => {
    if (!messagesLoaded || !myId) return
    const seeded = seenMessageIdsRef.current !== null
    const seen = seenMessageIdsRef.current ?? new Set<number>()
    let play = false
    for (const m of visibleMessages) {
      if (seen.has(m.id)) continue
      seen.add(m.id)
      if (seeded && m.recipient_id === myId && m.sender_id !== myId && isFresh(m.created_at)) play = true
    }
    seenMessageIdsRef.current = seen
    if (play) playSound(MESSAGE_NOTIFICATION_SOUND)
  }, [visibleMessages, messagesLoaded, myId])

  // Only responsible for nudging a refetch as soon as a message lands — visibility, the reveal
  // delay, and the sound are all handled above, off the query data itself, not this raw payload.
  // The key prefix also refreshes whichever thread is open.
  useEffect(() => {
    if (!myId) return
    const channel = supabase
      .channel('messages-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        queryClient.invalidateQueries({ queryKey: ['messages', myId] })
      })
      // RLS limits this to groups the viewer is in.
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'group_messages' }, () => {
        queryClient.invalidateQueries({ queryKey: ['group-chats', myId] })
      })
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [myId, queryClient])

  function openInbox() {
    setActiveUserId(null)
    setActiveUserName(null)
    setIsOpen(true)
  }

  function openChatWith(userId: string, name: string) {
    setActiveUserId(userId)
    setActiveUserName(name)
    setIsOpen(true)
  }

  function close() {
    setIsOpen(false)
  }

  return (
    <MessagingContext.Provider
      value={{
        isOpen,
        activeUserId,
        activeUserName,
        openInbox,
        openChatWith,
        close,
        myId,
        usersById,
        conversations,
        groups,
        groupsLoaded,
        totalUnread,
      }}
    >
      {children}
    </MessagingContext.Provider>
  )
}

export function useMessaging() {
  const ctx = useContext(MessagingContext)
  if (!ctx) throw new Error('useMessaging must be used within MessagingProvider')
  return ctx
}
