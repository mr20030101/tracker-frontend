import { formatTime } from './week'
import type { ChatGroupMember, GroupMessage, Message } from '../types'

// The "Sent" / "Seen" line under your latest message, as on Messenger. It only goes under a message
// of yours that's the newest in the chat: once the other side has replied, they've clearly seen it.

/** For a direct chat: "Seen 3:42 PM" once the recipient has opened it, "Sent" until then. */
export function directSeenStatus(thread: Message[], myId: string | null): { messageId: number; label: string } | null {
  const last = thread[thread.length - 1]
  if (!last || last.sender_id !== myId) return null
  return { messageId: last.id, label: last.read_at ? `Seen ${formatTime(last.read_at)}` : 'Sent' }
}

const NAMES_SHOWN = 3

/** For a group: who has read up to your latest message ("Seen by Ana, Ben and 2 others"), by each member's last read time. */
export function groupSeenStatus(
  messages: GroupMessage[],
  members: ChatGroupMember[],
  myId: string | null,
): { messageId: number; label: string } | null {
  const last = messages[messages.length - 1]
  if (!last || last.sender_id !== myId) return null
  const others = members.filter((m) => m.id !== myId)
  const sentAt = Date.parse(last.created_at)
  const readers = others.filter((m) => m.last_read_at && Date.parse(m.last_read_at) >= sentAt)
  if (readers.length === 0) return { messageId: last.id, label: 'Sent' }
  if (readers.length === others.length) return { messageId: last.id, label: 'Seen by everyone' }
  const names = readers.map((m) => m.name.split(' ')[0])
  const rest = names.length - NAMES_SHOWN
  const label = rest > 0 ? `${names.slice(0, NAMES_SHOWN).join(', ')} and ${rest} other${rest === 1 ? '' : 's'}` : joinNames(names)
  return { messageId: last.id, label: `Seen by ${label}` }
}

function joinNames(names: string[]): string {
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}
