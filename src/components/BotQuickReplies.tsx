import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

// Messenger's own send-bubble blue, matching MessageBubble.tsx — kept local rather than
// repointing the app's global --color-accent, which drives buttons everywhere else.
const BUBBLE_BLUE = '#0084ff'

const HIDDEN_KEY = 'botQuickRepliesHidden'

// Each phrase contains a keyword from a bot_faqs row, since bot-reply matches by literal substring —
// reword one of these and check it still hits a row.
const QUICK_REPLIES = [
  'How do I request an extension?',
  'How do I report a bad video?',
  'When is Platform Movement Yes?',
  'What are the bad video categories?',
  'How does Collector Rating work?',
  'How do I clip idle frames?',
  'Can I use brand names in text?',
  'What are the Lidar Lite shortcuts?',
]

function readHidden(): boolean {
  try {
    return localStorage.getItem(HIDDEN_KEY) === '1'
  } catch {
    return false
  }
}

export function BotQuickReplies({
  onPick,
  disabled,
  className = '',
}: {
  onPick: (text: string) => void
  disabled: boolean
  className?: string
}) {
  const [hidden, setHidden] = useState(readHidden)

  function toggle() {
    const next = !hidden
    setHidden(next)
    try {
      localStorage.setItem(HIDDEN_KEY, next ? '1' : '0')
    } catch {
      // Storage can be blocked (private window); the toggle still works for this session.
    }
  }

  const ToggleIcon = hidden ? ChevronUp : ChevronDown

  return (
    <div className="border-t border-gray-100 px-3 pt-1.5">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={!hidden}
        className="ml-auto flex items-center gap-1 text-[11px] font-medium text-gray-400 hover:text-gray-600"
      >
        {hidden ? 'Show suggested questions' : 'Hide suggestions'}
        <ToggleIcon className="h-3 w-3" />
      </button>
      {!hidden && (
        <div className={`flex flex-col items-end gap-2 pb-1 pt-1.5 ${className}`}>
          {QUICK_REPLIES.map((text) => (
            <button
              key={text}
              type="button"
              disabled={disabled}
              onClick={() => onPick(text)}
              style={{ borderColor: BUBBLE_BLUE, color: BUBBLE_BLUE }}
              className="rounded-full border bg-transparent px-3 py-1 text-xs font-medium hover:bg-sky-500/10 disabled:opacity-50"
            >
              {text}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
