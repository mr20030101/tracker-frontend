import { useEffect, useRef, useState } from 'react'

const EMOJIS = [
  '😀', '😂', '😊', '😍', '😘', '😎', '🤔', '😅', '😢', '😭',
  '😡', '😱', '😴', '🥳', '🙄', '😬', '🤝', '👍', '👎', '🙏',
  '👏', '💪', '🎉', '🔥', '✅', '❌', '❤️', '💯', '👀', '🚀',
]

export function EmojiPickerButton({ onSelect }: { onSelect: (emoji: string) => void }) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    window.addEventListener('mousedown', handleClickOutside)
    return () => window.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
        aria-label="Add emoji"
      >
        <span className="text-base leading-none">🙂</span>
      </button>
      {open && (
        <div className="absolute bottom-full right-0 z-20 mb-2 grid w-56 grid-cols-8 gap-1 rounded-xl border border-gray-200 bg-white p-2 shadow-lg">
          {EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                onSelect(emoji)
                setOpen(false)
              }}
              className="rounded p-1 text-lg hover:bg-gray-100"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
