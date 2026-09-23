import { useState } from 'react'
import { Check } from 'lucide-react'
import { convertEmoticons } from '../lib/emoticons'
import { formatBotMessage } from '../lib/formatBotMessage'
import { ActionsMenu } from './ActionsMenu'
import { Avatar } from './Avatar'
import type { Message } from '../types'

// Messenger's own send-bubble blue — kept local to this component (an arbitrary value, not a
// theme token) rather than repointing the app's global --color-accent, since that accent drives
// buttons everywhere else in the app and this "Messenger look" was asked for on the chat only.
const BUBBLE_BLUE = '#0084ff'

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function MessageBubble({
  message,
  mine,
  isBot = false,
  otherName,
  otherAvatarUrl,
  selectable = false,
  selected = false,
  onToggleSelect,
  onDelete,
}: {
  message: Message
  mine: boolean
  isBot?: boolean
  otherName?: string
  otherAvatarUrl?: string | null
  selectable?: boolean
  selected?: boolean
  onToggleSelect?: () => void
  onDelete: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className={`group flex flex-col gap-0.5 ${mine ? 'items-end' : 'items-start'}`}>
        <div className={`flex items-center gap-1.5 ${mine ? 'flex-row-reverse' : 'flex-row'}`}>
          {!mine && <Avatar name={otherName ?? ''} photoUrl={otherAvatarUrl} size={24} />}
          <div
            onClick={selectable ? onToggleSelect : undefined}
            style={mine ? { backgroundColor: BUBBLE_BLUE } : undefined}
            className={`max-w-md rounded-3xl px-3.5 py-2 text-sm ${
              mine ? 'text-white' : 'bg-gray-100 text-gray-800'
            } ${selectable ? 'cursor-pointer' : ''} ${selected ? 'ring-2 ring-accent ring-offset-1' : ''}`}
          >
            <div className="whitespace-pre-wrap wrap-break-word">
              {isBot ? formatBotMessage(message.body) : convertEmoticons(message.body)}
            </div>
          </div>
          {selectable ? (
            <button
              onClick={onToggleSelect}
              aria-label={selected ? 'Deselect message' : 'Select message'}
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
                selected ? 'border-accent bg-accent text-accent-foreground' : 'border-gray-300 text-transparent hover:border-gray-400'
              }`}
            >
              <Check className="h-3 w-3" />
            </button>
          ) : (
            <div
              className={`shrink-0 transition-opacity ${menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
            >
              <ActionsMenu
                label="Message actions"
                onOpenChange={setMenuOpen}
                items={[{ label: 'Delete', variant: 'danger', onClick: onDelete }]}
              />
            </div>
          )}
        </div>
        <span
          className={`px-1 text-[10px] text-gray-400 opacity-0 transition-opacity group-hover:opacity-100 ${
            !mine ? 'ml-[30px]' : ''
          }`}
        >
          {formatTime(message.created_at)}
        </span>
      </div>
    </div>
  )
}
