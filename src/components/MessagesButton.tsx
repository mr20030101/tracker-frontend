import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useMessaging } from '../lib/messagingContext'
import { convertEmoticons } from '../lib/emoticons'
import { deleteConversationForMe, deleteMessageForMe, deleteMessagesForMe, markThreadRead, sendMessage } from '../lib/messages'
import { formatActiveStatus } from '../lib/presence'
import type { Message } from '../types'
import { ActionsMenu } from './ActionsMenu'
import { AvatarWithStatus } from './AvatarWithStatus'
import { BotQuickReplies } from './BotQuickReplies'
import { MessageBubble } from './MessageBubble'
import { TypingIndicator } from './TypingIndicator'
import { EmojiPickerButton } from './EmojiPickerButton'
import { useBotTyping } from '../lib/useBotTyping'
import { useThread } from '../lib/useThread'

// Messenger's own send-bubble blue, matching MessageBubble.tsx — kept local rather than
// repointing the app's global --color-accent, which drives buttons everywhere else.
const BUBBLE_BLUE = '#0084ff'

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function MessagesButton() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const { isOpen, activeUserId, activeUserName, openInbox, openChatWith, close, myId, usersById, conversations, totalUnread } =
    useMessaging()
  const [draft, setDraft] = useState('')
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const threadEndRef = useRef<HTMLDivElement>(null)

  // Only loads while a chat is open (activeUserId set), a page at a time.
  const { messages: thread, isLoading: threadLoading, hasOlder, loadingOlder, loadOlder, scrollRef } = useThread(myId, activeUserId)
  const activeUser = activeUserId ? usersById.get(activeUserId) : undefined
  const activeUserAvatarUrl = activeUser?.avatar_url ?? null
  const activeUserIsBot = Boolean(activeUser?.is_bot)
  const { visibleThread, isTyping } = useBotTyping(thread, myId, activeUserIsBot)

  useEffect(() => {
    setSelectMode(false)
    setSelectedIds(new Set())
  }, [activeUserId])

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  useEffect(() => {
    if (!myId || !activeUserId) return
    const hasUnread = thread.some((m) => m.recipient_id === myId && m.sender_id === activeUserId && !m.read_at)
    if (hasUnread) {
      markThreadRead(myId, activeUserId).then(() => queryClient.invalidateQueries({ queryKey: ['messages', myId] }))
    }
  }, [myId, activeUserId, thread, queryClient])

  // Keyed on the newest message, not the count, so loading older messages doesn't jump to the bottom.
  const newestMessageId = visibleThread[visibleThread.length - 1]?.id
  useEffect(() => {
    if (isOpen && activeUserId) threadEndRef.current?.scrollIntoView({ block: 'nearest' })
  }, [isOpen, activeUserId, newestMessageId, isTyping])

  const sendMutation = useMutation({
    mutationFn: async (text: string) => {
      if (!activeUserId) return
      return sendMessage(activeUserId, text)
    },
    onSuccess: (_data, sent) => {
      // A quick-reply chip sends without touching the box, so only clear what was actually sent.
      setDraft((d) => (d.trim() === sent ? '' : d))
      queryClient.invalidateQueries({ queryKey: ['messages', myId] })
    },
  })

  function handleSend(e: FormEvent) {
    e.preventDefault()
    if (!draft.trim() || sendMutation.isPending) return
    sendMutation.mutate(draft.trim())
  }

  const showQuickReplies = activeUserIsBot && !selectMode

  const deleteMutation = useMutation({
    mutationFn: (message: Message) => deleteMessageForMe(myId!, message),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['messages', myId] }),
  })

  function handleDelete(message: Message) {
    if (confirm('Delete this message for you? The other person will still see it.')) {
      deleteMutation.mutate(message)
    }
  }

  const bulkDeleteMutation = useMutation({
    mutationFn: (messages: Message[]) => deleteMessagesForMe(myId!, messages),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', myId] })
      setSelectMode(false)
      setSelectedIds(new Set())
    },
  })

  function handleBulkDelete() {
    const selected = thread.filter((m) => selectedIds.has(m.id))
    if (selected.length === 0) return
    if (confirm(`Delete ${selected.length} message${selected.length === 1 ? '' : 's'} for you? The other person will still see them.`)) {
      bulkDeleteMutation.mutate(selected)
    }
  }

  const deleteConversationMutation = useMutation({
    mutationFn: (otherUserId: string) => deleteConversationForMe(myId!, otherUserId),
    onSuccess: (_data, otherUserId) => {
      queryClient.invalidateQueries({ queryKey: ['messages', myId] })
      if (activeUserId === otherUserId) openInbox()
    },
  })

  function handleDeleteConversation(otherUserId: string, otherUserName: string) {
    if (confirm(`Delete your whole conversation with ${otherUserName}? The other person will still see their copy.`)) {
      deleteConversationMutation.mutate(otherUserId)
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
                  <AvatarWithStatus name={activeUserName ?? ''} photoUrl={activeUserAvatarUrl} lastSeenAt={activeUser?.last_seen_at} size={28} />
                  <div className="flex min-w-0 flex-col">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-semibold text-gray-900">{activeUserName}</span>
                      {activeUserIsBot && (
                        <span className="inline-flex items-center rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">
                          Bot
                        </span>
                      )}
                    </div>
                    {!activeUserIsBot && activeUser?.last_seen_at && (
                      <span className="text-[11px] text-gray-400">{formatActiveStatus(activeUser?.last_seen_at ?? null)}</span>
                    )}
                  </div>
                  <div className="ml-auto">
                    <ActionsMenu
                      items={[
                        { label: 'Select messages', onClick: () => setSelectMode(true), disabled: thread.length === 0 },
                        {
                          label: 'Delete conversation',
                          variant: 'danger',
                          onClick: () => handleDeleteConversation(activeUserId!, activeUserName ?? 'this person'),
                        },
                      ]}
                    />
                  </div>
                </div>
                <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2">
                  {hasOlder && (
                    <button
                      type="button"
                      onClick={loadOlder}
                      disabled={loadingOlder}
                      className="mx-auto mb-2 block rounded-full border border-gray-200 px-3 py-1 text-[11px] font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                    >
                      {loadingOlder ? 'Loading...' : 'Load earlier messages'}
                    </button>
                  )}
                  {thread.length === 0 && !threadLoading && (
                    <div className="flex h-full items-center justify-center text-sm text-gray-400">
                      {activeUserIsBot ? `Ask ${activeUserName} anything.` : `Say hello to ${activeUserName}.`}
                    </div>
                  )}
                  <div className="flex flex-col gap-2">
                    {visibleThread.map((m: Message) => (
                      <MessageBubble
                        key={m.id}
                        message={m}
                        mine={m.sender_id === myId}
                        isBot={m.sender_id !== myId && activeUserIsBot}
                        otherName={activeUserName ?? undefined}
                        otherAvatarUrl={activeUserAvatarUrl}
                        selectable={selectMode}
                        selected={selectedIds.has(m.id)}
                        onToggleSelect={() => toggleSelect(m.id)}
                        onDelete={() => handleDelete(m)}
                      />
                    ))}
                    {isTyping && <TypingIndicator />}
                  </div>
                  <div ref={threadEndRef} />
                </div>
                {showQuickReplies && (
                  <BotQuickReplies
                    onPick={(text) => sendMutation.mutate(text)}
                    disabled={sendMutation.isPending || isTyping}
                    className="max-h-36 overflow-y-auto"
                  />
                )}
                {selectMode ? (
                  <div className="flex items-center gap-2 border-t border-gray-100 p-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectMode(false)
                        setSelectedIds(new Set())
                      }}
                      className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600"
                    >
                      Cancel
                    </button>
                    <span className="flex-1 text-xs text-gray-500">{selectedIds.size} selected</span>
                    <button
                      type="button"
                      onClick={handleBulkDelete}
                      disabled={selectedIds.size === 0 || bulkDeleteMutation.isPending}
                      className="rounded-lg bg-status-danger-text px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleSend} className={`flex items-center gap-2 p-2 ${showQuickReplies ? '' : 'border-t border-gray-100'}`}>
                    <input
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder="Aa"
                      className="flex-1 rounded-full border border-gray-200 bg-gray-50 px-3.5 py-1.5 text-sm outline-none focus:border-accent"
                    />
                    <EmojiPickerButton onSelect={(emoji) => setDraft((d) => d + emoji)} />
                    <button
                      type="submit"
                      disabled={!draft.trim() || sendMutation.isPending}
                      style={{ backgroundColor: BUBBLE_BLUE }}
                      className="rounded-full px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      Send
                    </button>
                  </form>
                )}
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
                    <div key={c.otherUserId} className="flex items-center hover:bg-gray-50">
                      <button
                        onClick={() => openChatWith(c.otherUserId, c.otherUserName)}
                        className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left"
                      >
                        <AvatarWithStatus
                          name={c.otherUserName}
                          photoUrl={c.otherUserAvatarUrl}
                          lastSeenAt={usersById.get(c.otherUserId)?.last_seen_at}
                          size={32}
                        />
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
                      <div className="shrink-0 pr-1">
                        <ActionsMenu
                          items={[
                            {
                              label: 'Delete conversation',
                              variant: 'danger',
                              onClick: () => handleDeleteConversation(c.otherUserId, c.otherUserName),
                            },
                          ]}
                        />
                      </div>
                    </div>
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
