import { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './api'
import { useAuth } from './auth'
import { buildConversations, fetchAllMessages, fetchDirectory } from './messages'
import { MESSAGE_NOTIFICATION_SOUND, playSound } from './sound'
import { botMessageRevealAt } from './useBotTyping'
import type { Conversation, DirectoryUser, Message } from '../types'

interface MessagingContextValue {
  isOpen: boolean
  activeUserId: string | null
  activeUserName: string | null
  openInbox: () => void
  openChatWith: (userId: string, name: string) => void
  close: () => void
  myId: string | null
  allMessages: Message[]
  usersById: Map<string, DirectoryUser>
  conversations: Conversation[]
  totalUnread: number
  threadWith: (otherUserId: string | null) => Message[]
}

const MessagingContext = createContext<MessagingContextValue | null>(null)

export function MessagingProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const myId = user?.id ?? null
  const queryClient = useQueryClient()

  const [isOpen, setIsOpen] = useState(false)
  const [activeUserId, setActiveUserId] = useState<string | null>(null)
  const [activeUserName, setActiveUserName] = useState<string | null>(null)

  const { data: allMessages = [], isSuccess: messagesLoaded } = useQuery({
    queryKey: ['messages', myId],
    queryFn: () => fetchAllMessages(myId!),
    enabled: Boolean(myId),
    refetchInterval: 15000,
  })

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
  // once the scheduled reveal timer below fires, since `allMessages`/`usersById` won't have changed.
  const [revealTick, forceRevealTick] = useReducer((c: number) => c + 1, 0)
  const visibleMessages = useMemo(() => {
    const now = Date.now()
    return allMessages.filter((m) => !usersById.get(m.sender_id)?.is_bot || botMessageRevealAt(m, allMessages) <= now)
  }, [allMessages, usersById, revealTick])
  useEffect(() => {
    const now = Date.now()
    const nextReveal = allMessages
      .filter((m) => usersById.get(m.sender_id)?.is_bot)
      .map((m) => botMessageRevealAt(m, allMessages))
      .filter((t) => t > now)
      .reduce((min: number | null, t) => (min === null || t < min ? t : min), null)
    if (nextReveal === null) return
    const timer = setTimeout(forceRevealTick, nextReveal - now)
    return () => clearTimeout(timer)
  }, [allMessages, usersById])

  const conversations = useMemo(
    () => (myId ? buildConversations(myId, visibleMessages, usersById) : []),
    [myId, visibleMessages, usersById],
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

  function threadWith(otherUserId: string | null): Message[] {
    if (!otherUserId || !myId) return []
    return allMessages.filter(
      (m) =>
        (m.sender_id === myId && m.recipient_id === otherUserId) ||
        (m.sender_id === otherUserId && m.recipient_id === myId),
    )
  }

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
        allMessages,
        usersById,
        conversations,
        totalUnread,
        threadWith,
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
