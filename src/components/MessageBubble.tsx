import { useState } from 'react'
import { Check, Phone, PhoneMissed } from 'lucide-react'
import { callLogTitle, formatCallDuration, parseCallLog, type CallLog } from '../lib/callLog'
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
  onCallBack,
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
  // Shown on call entries: rings the other person back.
  onCallBack?: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const callLog = isBot ? null : parseCallLog(message.body)

  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className={`group flex flex-col gap-0.5 ${mine ? 'items-end' : 'items-start'}`}>
        <div className={`flex items-center gap-1.5 ${mine ? 'flex-row-reverse' : 'flex-row'}`}>
          {!mine && <Avatar name={otherName ?? ''} photoUrl={otherAvatarUrl} size={24} />}
          {callLog ? (
            <CallEntry
              log={callLog}
              mine={mine}
              onClick={selectable ? onToggleSelect : undefined}
              selected={selected}
              onCallBack={selectable ? undefined : onCallBack}
            />
          ) : (
            <div
              onClick={selectable ? onToggleSelect : undefined}
              style={mine ? { backgroundColor: BUBBLE_BLUE } : undefined}
              className={`max-w-lg rounded-3xl px-3.5 py-2 text-sm ${mine ? 'text-white' : 'bg-gray-100 text-gray-800'
                } ${selectable ? 'cursor-pointer' : ''} ${selected ? 'ring-2 ring-accent ring-offset-1' : ''}`}
            >
              <div className="whitespace-pre-wrap wrap-break-word">
                {isBot ? formatBotMessage(message.body) : convertEmoticons(message.body)}
              </div>
            </div>
          )}
          {selectable ? (
            <button
              onClick={onToggleSelect}
              aria-label={selected ? 'Deselect message' : 'Select message'}
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${selected ? 'border-accent bg-accent text-accent-foreground' : 'border-gray-300 text-transparent hover:border-gray-400'
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
          className={`px-1 text-[10px] text-gray-400 opacity-0 transition-opacity group-hover:opacity-100 ${!mine ? 'ml-[30px]' : ''
            }`}
        >
          {formatTime(message.created_at)}
        </span>
      </div>
    </div>
  )
}

// A call's line in the conversation: missed/declined in red, or a finished call with how long it lasted.
function CallEntry({
  log,
  mine,
  selected,
  onClick,
  onCallBack,
}: {
  log: CallLog
  mine: boolean
  selected: boolean
  onClick?: () => void
  onCallBack?: () => void
}) {
  const missed = log.outcome !== 'ended'
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3 rounded-2xl bg-gray-100 py-2 pl-2.5 pr-4 ${onClick ? 'cursor-pointer' : ''} ${
        selected ? 'ring-2 ring-accent ring-offset-1' : ''
      }`}
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
          missed ? 'bg-status-danger-bg text-status-danger-text' : 'bg-gray-200 text-gray-700'
        }`}
      >
        {missed ? <PhoneMissed className="h-4 w-4" /> : <Phone className="h-4 w-4" />}
      </span>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-gray-900">{callLogTitle(log, mine)}</div>
        <div className="text-xs text-gray-500">
          {log.outcome === 'ended' ? formatCallDuration(log.seconds) : null}
          {onCallBack && (
            <>
              {log.outcome === 'ended' && ' · '}
              <button type="button" onClick={onCallBack} className="font-semibold text-status-success-text hover:underline">
                {mine ? 'Call again' : 'Call back'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
