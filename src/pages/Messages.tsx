import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { useMessaging } from '../lib/messagingContext'
import { convertEmoticons } from '../lib/emoticons'
import { deleteMessageForMe, markThreadRead, sendMessage } from '../lib/messages'
import type { Message } from '../types'
import { Avatar } from '../components/Avatar'
import { MessageBubble } from '../components/MessageBubble'
import { EmojiPickerButton } from '../components/EmojiPickerButton'

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function Messages() {
  const { userId: routeUserId } = useParams<{ userId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { myId, usersById, conversations, threadWith } = useMessaging()
  const [draft, setDraft] = useState('')
  const [userSearch, setUserSearch] = useState('')
  const threadEndRef = useRef<HTMLDivElement>(null)

  const selectedUserId = routeUserId ?? null
  const selectedUser = selectedUserId ? usersById.get(selectedUserId) : undefined
  const thread = threadWith(selectedUserId)

  const searchResults = userSearch.trim()
    ? Array.from(usersById.values())
        .filter((u) => u.id !== myId && u.name.toLowerCase().includes(userSearch.trim().toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name))
    : []

  function startConversation(userId: string) {
    setUserSearch('')
    navigate(`/messages/${userId}`)
  }

  useEffect(() => {
    if (!myId || !selectedUserId) return
    const hasUnread = thread.some((m) => m.recipient_id === myId && m.sender_id === selectedUserId && !m.read_at)
    if (hasUnread) {
      markThreadRead(myId, selectedUserId).then(() => queryClient.invalidateQueries({ queryKey: ['messages', myId] }))
    }
  }, [myId, selectedUserId, thread, queryClient])

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: 'nearest' })
  }, [selectedUserId, thread.length])

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!selectedUserId) return
      return sendMessage(selectedUserId, draft.trim())
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

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Messages</h1>
        <p className="text-sm text-gray-500">Direct conversations with anyone on the team.</p>
      </div>

      <div className="flex h-[calc(100vh-14rem)] overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="flex w-72 shrink-0 flex-col border-r border-gray-200">
          <div className="border-b border-gray-100 p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search people to message..."
                className="w-full rounded-lg border border-gray-200 bg-gray-50 py-1.5 pl-8 pr-3 text-sm outline-none focus:border-accent"
              />
            </div>
          </div>
          {userSearch.trim() ? (
            <div className="flex-1 overflow-y-auto">
              {searchResults.length === 0 && (
                <div className="px-4 py-6 text-center text-sm text-gray-400">No matching people.</div>
              )}
              {searchResults.map((u) => (
                <button
                  key={u.id}
                  onClick={() => startConversation(u.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50"
                >
                  <Avatar name={u.name} photoUrl={u.avatar_url} size={36} />
                  <span className="truncate text-sm font-medium text-gray-900">{u.name}</span>
                </button>
              ))}
            </div>
          ) : (
            <>
              <div className="border-b border-gray-100 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
                Conversations
              </div>
              <div className="flex-1 overflow-y-auto">
                {conversations.length === 0 && (
                  <div className="px-4 py-6 text-center text-sm text-gray-400">
                    No conversations yet. Search above to message someone.
                  </div>
                )}
                {conversations.map((c) => {
                  const isSelected = selectedUserId === c.otherUserId
                  return (
                  <button
                    key={c.otherUserId}
                    onClick={() => navigate(`/messages/${c.otherUserId}`)}
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 ${
                      isSelected ? 'bg-accent-bg' : ''
                    }`}
                  >
                    <Avatar name={c.otherUserName} photoUrl={c.otherUserAvatarUrl} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`truncate text-sm font-medium ${isSelected ? 'text-accent-foreground' : 'text-gray-900'}`}>{c.otherUserName}</span>
                        <span className={`shrink-0 text-[10px] ${isSelected ? 'text-accent-foreground/70' : 'text-gray-400'}`}>{formatTime(c.lastMessage.created_at)}</span>
                      </div>
                      <div className={`truncate text-xs ${isSelected ? 'text-accent-foreground/80' : 'text-gray-500'}`}>
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
                  )
                })}
              </div>
            </>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          {selectedUserId ? (
            <>
              <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-3.5">
                <Avatar name={selectedUser?.name ?? ''} photoUrl={selectedUser?.avatar_url} size={32} />
                <span className="font-semibold text-gray-900">{selectedUser?.name ?? 'Unknown'}</span>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-4">
                {thread.length === 0 && (
                  <div className="flex h-full items-center justify-center text-sm text-gray-400">
                    Say hello to {selectedUser?.name}.
                  </div>
                )}
                <div className="flex flex-col gap-2">
                  {thread.map((m: Message) => (
                    <MessageBubble key={m.id} message={m} mine={m.sender_id === myId} onDelete={() => handleDelete(m)} />
                  ))}
                </div>
                <div ref={threadEndRef} />
              </div>
              <form onSubmit={handleSend} className="flex items-center gap-2 border-t border-gray-100 p-3">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Message..."
                  className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent"
                />
                <EmojiPickerButton onSelect={(emoji) => setDraft((d) => d + emoji)} />
                <button
                  type="submit"
                  disabled={!draft.trim() || sendMutation.isPending}
                  className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
                >
                  Send
                </button>
              </form>
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-gray-400">
              Select a conversation to start messaging.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
