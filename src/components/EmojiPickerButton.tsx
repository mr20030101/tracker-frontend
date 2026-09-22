import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const EMOJIS = [
  '😀', '😂', '😊', '😍', '😘', '😎', '🤔', '😅', '😢', '😭',
  '😡', '😱', '😴', '🥳', '🙄', '😬', '🤝', '👍', '👎', '🙏',
  '👏', '💪', '🎉', '🔥', '✅', '❌', '❤️', '💯', '👀', '🚀',
]

const PANEL_WIDTH = 224
const EDGE_GAP = 8
// Above Modal's z-50, so a picker opened inside a modal isn't covered by it.
const PANEL_Z_INDEX = 60

interface PanelPosition {
  top?: number
  bottom?: number
  right: number
}

export function EmojiPickerButton({ onSelect }: { onSelect: (emoji: string) => void }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<PanelPosition | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Fixed-position panel, measured against the button: never clipped by the chat panel's
  // overflow-hidden edge, and opens upward unless there isn't room above.
  useLayoutEffect(() => {
    const button = buttonRef.current
    if (!open || !button) return
    const rect = button.getBoundingClientRect()
    const above = rect.top - EDGE_GAP
    const openDown = above < 200 && window.innerHeight - rect.bottom > above
    setPos({
      ...(openDown ? { top: rect.bottom + 8 } : { bottom: window.innerHeight - rect.top + 8 }),
      right: window.innerWidth - rect.right,
    })
  }, [open])

  function close() {
    setOpen(false)
    setPos(null)
  }

  useLayoutEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node) &&
        !panelRef.current?.contains(e.target as Node)
      ) {
        close()
      }
    }
    window.addEventListener('mousedown', handleClickOutside)
    return () => window.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
        aria-label="Add emoji"
      >
        <span className="text-base leading-none">🙂</span>
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            style={{ position: 'fixed', zIndex: PANEL_Z_INDEX, width: PANEL_WIDTH, ...pos }}
            className="grid grid-cols-8 gap-1 rounded-xl border border-gray-200 bg-white p-2 shadow-lg"
          >
            {EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  onSelect(emoji)
                  close()
                }}
                className="rounded p-1 text-lg hover:bg-gray-100"
              >
                {emoji}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  )
}
