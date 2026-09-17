import { Trash2 } from 'lucide-react'
import type { Message } from '../types'

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

export function MessageBubble({
  message,
  mine,
  onDelete,
}: {
  message: Message
  mine: boolean
  onDelete: () => void
}) {
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className={`group flex items-end gap-1 ${mine ? 'flex-row-reverse' : 'flex-row'}`}>
        <div
          className={`max-w-md rounded-2xl px-3 py-1.5 text-sm ${
            mine ? 'bg-accent text-accent-foreground' : 'bg-gray-100 text-gray-800'
          }`}
        >
          <div className="whitespace-pre-wrap wrap-break-word">{message.body}</div>
          <div className={`mt-0.5 text-[10px] ${mine ? 'text-accent-foreground/70' : 'text-gray-400'}`}>
            {formatTime(message.created_at)}
          </div>
        </div>
        <button
          onClick={onDelete}
          className="mb-1 shrink-0 rounded p-1 text-gray-300 opacity-0 transition-opacity hover:text-status-danger-text group-hover:opacity-100"
          aria-label="Delete message"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
