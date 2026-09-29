import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Info, Plus, Search } from 'lucide-react'
import { useMessaging } from '../lib/messagingContext'
import { deleteConversationForMe, deleteMessageForMe, deleteMessagesForMe, markThreadRead, sendMessage } from '../lib/messages'
import { formatActiveStatus } from '../lib/presence'
import { formatTime } from '../lib/week'
import { messagePath, parseMessageRef } from '../lib/urlRef'
import type { Message } from '../types'
import { ActionsMenu } from '../components/ActionsMenu'
import { Avatar } from '../components/Avatar'
import { AvatarWithStatus } from '../components/AvatarWithStatus'
import { BotQuickReplies, GRAMMAR_CHECK_MESSAGE, GrammarCheckButton } from '../components/BotQuickReplies'
import { ConversationInfoPanel } from '../components/ConversationInfoPanel'
import { CallButton } from '../components/CallBar'
import { MessageBubble } from '../components/MessageBubble'
import { TypingIndicator } from '../components/TypingIndicator'
import { EmojiPickerButton } from '../components/EmojiPickerButton'
import { useBotTyping } from '../lib/useBotTyping'
import { useThread } from '../lib/useThread'
import { messagePreview } from '../lib/callLog'
import { useCall } from '../lib/call'
import { errorMessage } from '../lib/api'
import { useAuth } from '../lib/auth'
import { groupPath } from '../lib/groupChats'
import { GroupChatPane, GroupIcon, NewGroupModal } from '../components/GroupChat'

// Messenger's own send-bubble blue, matching MessageBubble.tsx — kept local rather than
// repointing the app's global --color-accent, which drives buttons everywhere else.
const BUBBLE_BLUE = '#0084ff'

export function Messages() {
  const { userId: routeRef, groupId: groupRef } = useParams<{ userId: string; groupId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const { myId, usersById, conversations, groups, groupsLoaded } = useMessaging()
  const canCreateGroups = user?.role === 'admin' || user?.role === 'lead'
  const [creatingGroup, setCreatingGroup] = useState(false)
  const selectedGroupId = groupRef ? Number(groupRef) : null
  const selectedGroup = selectedGroupId ? groups.find((g) => g.id === selectedGroupId) : undefined
  const paneOpen = Boolean(routeRef || selectedGroupId)
  const { startCall } = useCall()
  const [draft, setDraft] = useState('')
  const [userSearch, setUserSearch] = useState('')
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [infoPanelOpen, setInfoPanelOpen] = useState(false)
  const threadEndRef = useRef<HTMLDivElement>(null)

  const selectedUserId = routeRef ? parseMessageRef(routeRef) : null
  const selectedUser = selectedUserId ? usersById.get(selectedUserId) : undefined
  const { messages: thread, isLoading: threadLoading, hasOlder, loadingOlder, loadOlder, scrollRef } = useThread(myId, selectedUserId)
  const { visibleThread, isTyping } = useBotTyping(thread, myId, Boolean(selectedUser?.is_bot))

  useEffect(() => {
    setSelectMode(false)
    setSelectedIds(new Set())
    setInfoPanelOpen(false)
  }, [selectedUserId])

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const searchResults = userSearch.trim()
    ? Array.from(usersById.values())
        .filter((u) => u.id !== myId && u.name.toLowerCase().includes(userSearch.trim().toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name))
    : []

  function startConversation(userId: string) {
    setUserSearch('')
    navigate(messagePath(userId))
  }

  useEffect(() => {
    if (!myId || !selectedUserId) return
    const hasUnread = thread.some((m) => m.recipient_id === myId && m.sender_id === selectedUserId && !m.read_at)
    if (hasUnread) {
      markThreadRead(myId, selectedUserId).then(() => queryClient.invalidateQueries({ queryKey: ['messages', myId] }))
    }
  }, [myId, selectedUserId, thread, queryClient])

  // Keyed on the newest message, not the count, so loading older messages doesn't jump to the bottom.
  const newestMessageId = visibleThread[visibleThread.length - 1]?.id
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: 'nearest' })
  }, [selectedUserId, newestMessageId, isTyping])

  const [sendError, setSendError] = useState<string | null>(null)
  const sendMutation = useMutation({
    mutationFn: async (text: string) => {
      if (!selectedUserId) return
      return sendMessage(selectedUserId, text)
    },
    onSuccess: (_data, sent) => {
      // A quick-reply chip sends without touching the box, so only clear what was actually sent.
      setDraft((d) => (d.trim() === sent ? '' : d))
      setSendError(null)
      queryClient.invalidateQueries({ queryKey: ['messages', myId] })
    },
    // The database refuses spam (too many messages a minute, over-long text) with a readable reason.
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

  const showQuickReplies = Boolean(selectedUser?.is_bot) && !selectMode

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
      if (selectedUserId === otherUserId) navigate('/messages')
    },
  })

  function handleDeleteConversation(otherUserId: string, otherUserName: string) {
    if (confirm(`Delete your whole conversation with ${otherUserName}? The other person will still see their copy.`)) {
      deleteConversationMutation.mutate(otherUserId)
    }
  }

  return (
    <div className="relative flex h-full min-h-0 overflow-hidden rounded-xl border border-gray-200 bg-white">
      {/* Phones show one pane at a time: the list, or the open conversation (with a back button). */}
      <div className={`${paneOpen ? 'hidden md:flex' : 'flex'} w-full shrink-0 flex-col border-gray-200 md:w-80 md:border-r`}>
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
                {u.is_bot && (
                  <span className="inline-flex items-center rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">
                    Bot
                  </span>
                )}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            {(groups.length > 0 || canCreateGroups) && (
              <>
                <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Groups</span>
                  {canCreateGroups && (
                    <button
                      type="button"
                      onClick={() => setCreatingGroup(true)}
                      className="flex items-center gap-1 text-xs font-semibold text-sky-700 hover:underline"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      New group
                    </button>
                  )}
                </div>
                {groups.length === 0 && (
                  <div className="px-4 py-3 text-xs text-gray-400">Make a group for your team or a project.</div>
                )}
                {groups.map((g) => {
                  const isSelected = selectedGroupId === g.id
                  const last = g.last_message
                  const lastSender = last ? (last.sender_id === myId ? 'You' : g.members.find((m) => m.id === last.sender_id)?.name.split(' ')[0]) : null
                  return (
                    <button
                      key={g.id}
                      onClick={() => navigate(groupPath(g.id))}
                      className={`flex w-full items-center gap-3 px-4 py-3 text-left ${isSelected ? 'bg-accent-bg' : 'hover:bg-gray-50'}`}
                    >
                      <GroupIcon size={36} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`truncate text-sm font-medium ${isSelected ? 'text-accent-foreground' : 'text-gray-900'}`}>{g.name}</span>
                          {last && (
                            <span className={`shrink-0 text-[10px] ${isSelected ? 'text-accent-foreground/70' : 'text-gray-400'}`}>{formatTime(last.created_at)}</span>
                          )}
                        </div>
                        <div className={`truncate text-xs ${isSelected ? 'text-accent-foreground/80' : 'text-gray-500'}`}>
                          {last ? `${lastSender ?? 'Someone'}: ${last.body}` : `${g.members.length} members`}
                        </div>
                      </div>
                      {g.unread_count > 0 && (
                        <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-status-danger-text px-1 text-[10px] font-bold text-white">
                          {g.unread_count}
                        </span>
                      )}
                    </button>
                  )
                })}
              </>
            )}
            <div className="border-b border-gray-100 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
              Conversations
            </div>
            <div>
              {conversations.length === 0 && (
                <div className="px-4 py-6 text-center text-sm text-gray-400">
                  No conversations yet. Search above to message someone.
                </div>
              )}
              {conversations.map((c) => {
                const isSelected = selectedUserId === c.otherUserId
                return (
                  <div key={c.otherUserId} className={`flex items-center ${isSelected ? 'bg-accent-bg' : 'hover:bg-gray-50'}`}>
                    <button
                      onClick={() => navigate(messagePath(c.otherUserId))}
                      className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left"
                    >
                      <AvatarWithStatus
                        name={c.otherUserName}
                        photoUrl={c.otherUserAvatarUrl}
                        lastSeenAt={usersById.get(c.otherUserId)?.last_seen_at}
                        size={36}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`truncate text-sm font-medium ${isSelected ? 'text-accent-foreground' : 'text-gray-900'}`}>{c.otherUserName}</span>
                          <span className={`shrink-0 text-[10px] ${isSelected ? 'text-accent-foreground/70' : 'text-gray-400'}`}>{formatTime(c.lastMessage.created_at)}</span>
                        </div>
                        <div className={`truncate text-xs ${isSelected ? 'text-accent-foreground/80' : 'text-gray-500'}`}>
                          {messagePreview(c.lastMessage.body, c.lastMessage.sender_id === myId)}
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
                )
              })}
            </div>
          </div>
        )}
      </div>

      <div className={`${paneOpen ? 'flex' : 'hidden md:flex'} min-w-0 flex-1 flex-col`}>
        {selectedGroupId ? (
          selectedGroup ? (
            <GroupChatPane
              key={selectedGroup.id}
              group={selectedGroup}
              onBack={() => navigate('/messages')}
              onGone={() => navigate('/messages')}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-gray-400">
              {groupsLoaded ? "This group doesn't exist, or you're not in it." : 'Loading...'}
            </div>
          )
        ) : selectedUserId ? (
          <>
            <div className="flex items-center gap-3 border-b border-gray-100 px-3 py-3 sm:px-5">
              <button
                type="button"
                onClick={() => navigate('/messages')}
                aria-label="Back to conversations"
                className="-ml-1 shrink-0 rounded-md p-1 text-gray-500 hover:bg-gray-100 md:hidden"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <AvatarWithStatus
                name={selectedUser?.name ?? ''}
                photoUrl={selectedUser?.avatar_url}
                lastSeenAt={selectedUser?.last_seen_at}
                size={36}
              />
              <div className="flex min-w-0 flex-col">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900">{selectedUser?.name ?? 'Unknown'}</span>
                  {selectedUser?.is_bot && (
                    <span className="inline-flex items-center rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">
                      Bot
                    </span>
                  )}
                </div>
                {!selectedUser?.is_bot && selectedUser?.last_seen_at && (
                  <span className="text-xs text-gray-400">{formatActiveStatus(selectedUser?.last_seen_at ?? null)}</span>
                )}
              </div>
              <CallButton
                peer={selectedUser ? { id: selectedUser.id, name: selectedUser.name, avatar_url: selectedUser.avatar_url } : null}
                isBot={selectedUser?.is_bot}
                className="ml-auto"
              />
              {selectedUser?.is_bot && (
                <div className="ml-auto">
                  <GrammarCheckButton
                    onClick={() => sendMutation.mutate(GRAMMAR_CHECK_MESSAGE)}
                    disabled={sendMutation.isPending || isTyping || selectMode}
                  />
                </div>
              )}
              <button
                type="button"
                onClick={() => setInfoPanelOpen((v) => !v)}
                aria-label="Conversation info"
                className={`${selectedUser ? '' : 'ml-auto'} flex h-9 w-9 items-center justify-center rounded-full ${
                  infoPanelOpen ? 'bg-violet-100 text-violet-600' : 'text-violet-500 hover:bg-violet-50'
                }`}
              >
                <Info className="h-5 w-5" />
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
              {thread.length === 0 && !threadLoading && (
                <div className="flex h-full items-center justify-center text-sm text-gray-400">
                  {selectedUser?.is_bot
                    ? `Ask ${selectedUser.name} anything.`
                    : `Say hello to ${selectedUser?.name}.`}
                </div>
              )}
              <div className="flex flex-col gap-2">
                {visibleThread.map((m: Message) => (
                  <MessageBubble
                    key={m.id}
                    message={m}
                    mine={m.sender_id === myId}
                    isBot={m.sender_id !== myId && Boolean(selectedUser?.is_bot)}
                    otherName={selectedUser?.name}
                    otherAvatarUrl={selectedUser?.avatar_url}
                    selectable={selectMode}
                    selected={selectedIds.has(m.id)}
                    onToggleSelect={() => toggleSelect(m.id)}
                    onDelete={() => handleDelete(m)}
                    onCallBack={
                      selectedUser && !selectedUser.is_bot
                        ? () => startCall({ id: selectedUser.id, name: selectedUser.name, avatar_url: selectedUser.avatar_url })
                        : undefined
                    }
                  />
                ))}
                {isTyping && <TypingIndicator />}
              </div>
              <div ref={threadEndRef} />
            </div>
            {sendError && (
              <div role="alert" className="px-4 pb-1 pt-2 text-xs text-status-danger-text">
                {sendError}
              </div>
            )}
            {showQuickReplies && (
              <BotQuickReplies onPick={(text) => sendMutation.mutate(text)} disabled={sendMutation.isPending || isTyping} />
            )}
            {selectMode ? (
              <div className="flex items-center gap-2 border-t border-gray-100 p-3">
                <button
                  type="button"
                  onClick={() => {
                    setSelectMode(false)
                    setSelectedIds(new Set())
                  }}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600"
                >
                  Cancel
                </button>
                <span className="flex-1 text-sm text-gray-500">{selectedIds.size} selected</span>
                <button
                  type="button"
                  onClick={handleBulkDelete}
                  disabled={selectedIds.size === 0 || bulkDeleteMutation.isPending}
                  className="rounded-lg bg-status-danger-text px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            ) : (
              <form onSubmit={handleSend} className={`flex items-center gap-2 p-3 ${showQuickReplies ? '' : 'border-t border-gray-100'}`}>
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Aa"
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
            )}
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-gray-400">
            Select a conversation to start messaging.
          </div>
        )}
      </div>

      {creatingGroup && (
        <NewGroupModal
          onClose={() => setCreatingGroup(false)}
          onCreated={(groupId) => {
            setCreatingGroup(false)
            navigate(groupPath(groupId))
          }}
        />
      )}

      {selectedUserId && selectedUser && infoPanelOpen && (
        <ConversationInfoPanel
          user={selectedUser}
          selectDisabled={thread.length === 0}
          onSelectMessages={() => {
            setSelectMode(true)
            setInfoPanelOpen(false)
          }}
          onDeleteConversation={() => handleDeleteConversation(selectedUserId, selectedUser.name)}
          onClose={() => setInfoPanelOpen(false)}
        />
      )}
    </div>
  )
}
