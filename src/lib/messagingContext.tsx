import { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './api'
import { useAuth } from './auth'
import { buildConversations, fetchConversationSummaries, fetchDirectory } from './messages'
import { MESSAGE_NOTIFICATION_SOUND, playSound } from './sound'
import { botMessageRevealAt } from './useBotTyping'
import type { Conversation, DirectoryUser } from '../types'

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
  totalUnread: number
}

const MessagingContext = createContext<MessagingContextValue | null>(null)

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
  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0)

  // Plays the notification sound exactly once per message, the moment it actually becomes visible
  // in `visibleMessages` — whether that's the instant a human's message arrives (immediately
  // visible) or whenever a bot reply's reveal timer fires (see above). Driving the sound off this
  // same visibility set, instead of a separate delay computed straight off the raw realtime payload,
  // is what keeps it from firing once early (on insert) and again later (on reveal): there's only
  // one place a message can be judged "newly visible" now. `null` (vs. an empty Set) marks that the
  // baseline hasn't been seeded yet, so the very first load doesn't play a sound for every message
  // already in history.
  const previousVisibleIdsRef = useRef<Set<number> | null>(null)
  useEffect(() => {
    if (!messagesLoaded || !myId) return
    const previousIds = previousVisibleIdsRef.current
    if (previousIds) {
      for (const m of visibleMessages) {
        if (m.recipient_id === myId && m.sender_id !== myId && !previousIds.has(m.id)) {
          playSound(MESSAGE_NOTIFICATION_SOUND)
        }
      }
    }
    previousVisibleIdsRef.current = new Set(visibleMessages.map((m) => m.id))
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
