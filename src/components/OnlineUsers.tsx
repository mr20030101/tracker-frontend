import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { MoreHorizontal, SquarePen, X } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { messagePreview } from '../lib/callLog'
import { useMessaging } from '../lib/messagingContext'
import { fetchDirectory } from '../lib/messages'
import { isOnline } from '../lib/presence'
import { Avatar } from './Avatar'

const MAX_SHOWN = 5

// Messenger-style chat heads down the right edge: a "..." menu on top, a bubble per person online
// (hover for their name and your last message, x to put the bubble away), and a compose button.
export function OnlineUsers() {
  const { user: currentUser } = useAuth()
  const { openChatWith, openInbox, conversations } = useMessaging()
  const { data } = useQuery({
    queryKey: ['directory'],
    queryFn: fetchDirectory,
    refetchInterval: 30_000,
  })
  // Bubbles put away with x (or "Close all bubbles"), for this visit; they're back after a reload.
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [menuOpen, setMenuOpen] = useState(false)

  const online = (data ?? []).filter(
    (u) => u.id !== currentUser?.id && u.is_active && isOnline(u.last_seen_at) && !dismissed.has(u.id),
  )
  if (online.length === 0) return null

  const shown = online.slice(0, MAX_SHOWN)
  const overflow = online.length - shown.length
  const conversationWith = new Map(conversations.map((c) => [c.otherUserId, c]))

  return (
    <div className="fixed bottom-6 right-6 z-40 hidden flex-col items-center gap-3 lg:flex">
      <div className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label="Chat bubble options"
          aria-expanded={menuOpen}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-700 text-white shadow-md transition-transform hover:scale-105"
        >
          <MoreHorizontal className="h-5 w-5" />
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0" onClick={() => setMenuOpen(false)} aria-hidden="true" />
            <div className="absolute right-full top-0 mr-3 w-44 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 text-sm shadow-lg">
              <Link to="/messages" onClick={() => setMenuOpen(false)} className="block px-3 py-2 text-gray-700 hover:bg-gray-50">
                Open Messages
              </Link>
              <button
                type="button"
                onClick={() => {
                  setDismissed(new Set([...dismissed, ...online.map((u) => u.id)]))
                  setMenuOpen(false)
                }}
                className="block w-full px-3 py-2 text-left text-gray-700 hover:bg-gray-50"
              >
                Close all bubbles
              </button>
            </div>
          </>
        )}
      </div>

      {shown.map((u) => {
        const conversation = conversationWith.get(u.id)
        const preview = conversation
          ? messagePreview(conversation.lastMessage.body, conversation.lastMessage.sender_id === currentUser?.id)
          : 'Active now'
        const unread = conversation?.unreadCount ?? 0
        return (
          <div key={u.id} className="group relative">
            <button
              type="button"
              onClick={() => openChatWith(u.id, u.name)}
              aria-label={`Message ${u.name}`}
              className="relative block rounded-full shadow-md transition-transform hover:scale-105"
            >
              <Avatar name={u.name} photoUrl={u.avatar_url} size={48} />
              <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full bg-status-success-text ring-2 ring-white" />
              {unread > 0 && (
                <span className="absolute -left-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-status-danger-text px-1 text-[10px] font-bold text-white ring-2 ring-white">
                  {unread}
                </span>
              )}
            </button>

            {/* Name and last message, to the left of the bubble while it's hovered or focused. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute right-full top-1/2 mr-4 w-56 -translate-y-1/2 rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 opacity-0 shadow-lg transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
            >
              <p className="truncate text-sm font-semibold text-gray-900">{u.name}</p>
              <p className="truncate text-sm text-gray-500">{preview}</p>
              <span className="absolute -right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rotate-45 border-r border-t border-gray-200 bg-white" />
            </div>

            <button
              type="button"
              onClick={() => setDismissed(new Set([...dismissed, u.id]))}
              aria-label={`Close ${u.name}'s bubble`}
              className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-gray-700 text-white opacity-0 shadow transition-opacity focus:opacity-100 group-hover:opacity-100"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )
      })}

      {overflow > 0 && (
        <button
          type="button"
          onClick={openInbox}
          aria-label={`${overflow} more online`}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-700 text-sm font-semibold text-white shadow-md transition-transform hover:scale-105"
        >
          +{overflow}
        </button>
      )}

      <button
        type="button"
        onClick={openInbox}
        aria-label="New message"
        title="New message"
        className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-gray-700 shadow-md ring-1 ring-gray-200 transition-transform hover:scale-105"
      >
        <SquarePen className="h-5 w-5" />
      </button>
    </div>
  )
}
