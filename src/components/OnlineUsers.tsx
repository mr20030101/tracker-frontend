import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../lib/auth'
import { useMessaging } from '../lib/messagingContext'
import { fetchDirectory } from '../lib/messages'
import { isOnline } from '../lib/presence'
import { Avatar } from './Avatar'

const MAX_SHOWN = 5

export function OnlineUsers() {
  const { user: currentUser } = useAuth()
  const { openChatWith } = useMessaging()
  const { data } = useQuery({
    queryKey: ['directory'],
    queryFn: fetchDirectory,
    refetchInterval: 30_000,
  })

  const online = (data ?? []).filter((u) => u.id !== currentUser?.id && u.is_active && isOnline(u.last_seen_at))
  if (online.length === 0) return null

  const shown = online.slice(0, MAX_SHOWN)
  const overflow = online.length - shown.length

  return (
    <div className="fixed bottom-6 right-6 z-40 hidden flex-col items-center gap-2 lg:flex">
      {shown.map((u) => (
        <button
          key={u.id}
          title={`Message ${u.name}`}
          onClick={() => openChatWith(u.id, u.name)}
          className="relative rounded-full shadow-md transition-transform hover:scale-105"
        >
          <Avatar name={u.name} photoUrl={u.avatar_url} size={36} />
          <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-status-success-text ring-2 ring-white" />
        </button>
      ))}
      {overflow > 0 && (
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-700 text-xs font-semibold text-white shadow-md">
          +{overflow}
        </div>
      )}
    </div>
  )
}
