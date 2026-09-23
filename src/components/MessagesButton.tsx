import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useMessaging } from '../lib/messagingContext'
import { convertEmoticons } from '../lib/emoticons'
import { deleteMessageForMe, markThreadRead, sendMessage } from '../lib/messages'
import type { Message } from '../types'
import { Avatar } from './Avatar'
import { MessageBubble } from './MessageBubble'
import { EmojiPickerButton } from './EmojiPickerButton'

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function MessagesButton() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { isOpen, activeUserId, activeUserName, openInbox, openChatWith, close, myId, usersById, conversations, totalUnread, threadWith } =
    useMessaging()
  const [draft, setDraft] = useState('')
  const threadEndRef = useRef<HTMLDivElement>(null)

  const thread = threadWith(activeUserId)
  const activeUserAvatarUrl = activeUserId ? (usersById.get(activeUserId)?.avatar_url ?? null) : null

  useEffect(() => {
    if (!myId || !activeUserId) return
    const hasUnread = thread.some((m) => m.recipient_id === myId && m.sender_id === activeUserId && !m.read_at)
    if (hasUnread) {
      markThreadRead(myId, activeUserId).then(() => queryClient.invalidateQueries({ queryKey: ['messages', myId] }))
    }
  }, [myId, activeUserId, thread, queryClient])

  useEffect(() => {
    if (isOpen && activeUserId) threadEndRef.current?.scrollIntoView({ block: 'nearest' })
  }, [isOpen, activeUserId, thread.length])

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!activeUserId) return
      return sendMessage(activeUserId, draft.trim())
    },
    onSuccess: () => {
      setDraft('')
      queryClient.invalidateQueries({ queryKey: ['messages', myId] })
    },
  })

  function handleSend(e: FormEvent) {
    e.preventDefault()
    if (!draft.trim() || sendMutation.isPending) return
    sendMutation.mutate()
  }

  const deleteMutation = useMutation({
    mutationFn: (message: Message) => deleteMessageForMe(myId!, message),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['messages', myId] }),
  })

  function handleDelete(message: Message) {
    if (confirm('Delete this message for you? The other person will still see it.')) {
      deleteMutation.mutate(message)
    }
  }

  if (!user) return null

  return (
    <div className="relative">
      <button
        onClick={() => (isOpen ? close() : openInbox())}
        className="relative rounded-lg border border-gray-200 bg-white p-2 text-gray-500 hover:bg-gray-50"
        aria-label="Messages"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
        {totalUnread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-status-danger-text px-1 text-[10px] font-bold text-white">
            {totalUnread}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={close} />
          <div className="fixed bottom-6 right-6 z-50 flex h-112 w-96 flex-col rounded-xl border border-gray-200 bg-white shadow-lg">
            {activeUserId ? (
              <>
                <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2.5">
                  <button onClick={openInbox} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Back">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <Avatar name={activeUserName ?? ''} photoUrl={activeUserAvatarUrl} size={24} />
                  <span className="truncate text-sm font-semibold text-gray-900">{activeUserName}</span>
                  {activeUserId && usersById.get(activeUserId)?.is_bot && (
                    <span className="inline-flex items-center rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">
                      Bot
                    </span>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto px-3 py-2">
                  {thread.length === 0 && (
                    <div className="flex h-full items-center justify-center text-sm text-gray-400">
                      Say hello to {activeUserName}.
                    </div>
                  )}
                  <div className="flex flex-col gap-2">
                    {thread.map((m: Message) => (
                      <MessageBubble
                        key={m.id}
                        message={m}
                        mine={m.sender_id === myId}
                        isBot={m.sender_id !== myId && Boolean(activeUserId && usersById.get(activeUserId)?.is_bot)}
                        onDelete={() => handleDelete(m)}
                      />
                    ))}
                  </div>
                  <div ref={threadEndRef} />
                </div>
                <form onSubmit={handleSend} className="flex items-center gap-2 border-t border-gray-100 p-2">
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Message..."
                    className="flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm outline-none focus:border-accent"
                  />
                  <EmojiPickerButton onSelect={(emoji) => setDraft((d) => d + emoji)} />
                  <button
                    type="submit"
                    disabled={!draft.trim() || sendMutation.isPending}
                    className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-foreground disabled:opacity-50"
                  >
                    Send
                  </button>
                </form>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2.5">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Messages</span>
                  <Link to="/messages" onClick={close} className="text-xs font-medium text-sky-700 hover:underline">
                    Open full view
                  </Link>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {conversations.length === 0 && (
                    <div className="flex h-full items-center justify-center px-4 text-center text-sm text-gray-400">
                      No conversations yet. Click someone online to start one.
                    </div>
                  )}
                  {conversations.map((c) => (
                    <button
                      key={c.otherUserId}
                      onClick={() => openChatWith(c.otherUserId, c.otherUserName)}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50"
                    >
                      <Avatar name={c.otherUserName} photoUrl={c.otherUserAvatarUrl} size={32} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sm font-medium text-gray-900">{c.otherUserName}</span>
                          <span className="shrink-0 text-[10px] text-gray-400">{formatTime(c.lastMessage.created_at)}</span>
                        </div>
                        <div className="truncate text-xs text-gray-500">
                          {c.lastMessage.sender_id === myId ? 'You: ' : ''}
                          {convertEmoticons(c.lastMessage.body)}
                        </div>
                      </div>
                      {c.unreadCount > 0 && (
                        <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-status-danger-text px-1 text-[10px] font-bold text-white">
                          {c.unreadCount}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
