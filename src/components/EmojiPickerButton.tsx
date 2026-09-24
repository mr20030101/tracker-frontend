import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ROBOTS } from './RobotEmoji'

const EMOJIS = [
  '😀', '😂', '😊', '😍', '😘', '😎', '🤔', '😅', '😢', '😭',
  '😡', '😱', '😴', '🥳', '🙄', '😬', '🤝', '👍', '👎', '🙏',
  '👏', '💪', '🎉', '🔥', '✅', '❌', '❤️', '💯', '👀', '🚀',
]

// The robot next to each page title, offered here too. Taken from the same list, so swapping one
// there swaps it here.
const ROBOT_EMOJIS = [...new Set(Object.values(ROBOTS))]

const PANEL_WIDTH = 224
const EDGE_GAP = 8
// Room the panel needs above the button before it opens upward instead of down.
const PANEL_HEIGHT = 260
// Above Modal's z-50, so a picker opened inside a modal isn't covered by it.
const PANEL_Z_INDEX = 60

interface PanelPosition {
  top?: number
  bottom?: number
  right: number
  // The room the panel has in the direction it opens; it scrolls if it's taller than that.
  maxHeight: number
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
    const below = window.innerHeight - rect.bottom - EDGE_GAP
    const openDown = above < PANEL_HEIGHT && below > above
    setPos({
      ...(openDown
        ? { top: rect.bottom + 8, maxHeight: below - 8 }
        : { bottom: window.innerHeight - rect.top + 8, maxHeight: above - 8 }),
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

  // `group` keeps keys unique: the rocket is in both lists.
  const pick = (emoji: string, group: string) => (
    <button
      key={`${group}-${emoji}`}
      type="button"
      onClick={() => {
        onSelect(emoji)
        close()
      }}
      className="rounded p-1 text-lg hover:bg-gray-100"
    >
      {emoji}
    </button>
  )

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
            className="grid grid-cols-8 gap-1 overflow-y-auto rounded-xl border border-gray-200 bg-white p-2 shadow-lg"
          >
            {EMOJIS.map((emoji) => pick(emoji, 'common'))}
            <div className="col-span-8 mt-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Robots</div>
            {ROBOT_EMOJIS.map((emoji) => pick(emoji, 'robots'))}
          </div>,
          document.body,
        )}
    </>
  )
}
