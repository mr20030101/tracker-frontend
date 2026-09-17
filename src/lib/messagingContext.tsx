import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './api'
import { useAuth } from './auth'
import { buildConversations, fetchAllMessages, fetchDirectory } from './messages'
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

  const { data: allMessages = [] } = useQuery({
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
  const conversations = useMemo(
    () => (myId ? buildConversations(myId, allMessages, usersById) : []),
    [myId, allMessages, usersById],
  )
  const totalUnread = conversations.reduce((sum, c) => sum + c.unreadCount, 0)

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
