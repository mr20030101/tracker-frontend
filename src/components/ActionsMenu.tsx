import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MoreVertical } from 'lucide-react'

export interface ActionsMenuItem {
  label: string
  onClick: () => void
  variant?: 'default' | 'danger'
  disabled?: boolean
  title?: string
}

interface ActionsMenuProps {
  items: ActionsMenuItem[]
  label?: string
  // Lets a hover-revealed trigger (e.g. a per-message action button that only shows on
  // group-hover) stay visible while its own menu is open, even after the pointer leaves the row —
  // the panel itself is portaled to <body>, so it's no longer a descendant the hover state covers.
  onOpenChange?: (open: boolean) => void
}

interface PanelPosition {
  top?: number
  bottom?: number
  right: number
}

const ITEM_HEIGHT = 30
const PANEL_PADDING = 12
const EDGE_GAP = 8
// Above Modal's z-50, so a menu opened inside a modal isn't covered by it.
const PANEL_Z_INDEX = 60

export function ActionsMenu({ items, label = 'Actions', onOpenChange }: ActionsMenuProps) {
  const [open, setOpenState] = useState(false)
  const [pos, setPos] = useState<PanelPosition | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  function setOpen(next: boolean) {
    setOpenState(next)
    onOpenChange?.(next)
  }

  // Fixed-position panel, measured against the button: flips upward near the bottom of the
  // screen and, being portaled to <body>, is never clipped by a table's rounded/overflow-hidden edge.
  useLayoutEffect(() => {
    const button = buttonRef.current
    if (!open || !button) return
    const rect = button.getBoundingClientRect()
    const panelHeight = items.length * ITEM_HEIGHT + PANEL_PADDING
    const below = window.innerHeight - rect.bottom - EDGE_GAP
    const openUp = below < panelHeight && rect.top > panelHeight
    setPos({
      ...(openUp ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
      right: window.innerWidth - rect.right,
    })
  }, [open, items.length])

  function close() {
    setOpen(false)
    setPos(null)
  }

  // The panel no longer scrolls with the button once portaled, so close it if the page scrolls
  // underneath instead of leaving it floating over the wrong row.
  useLayoutEffect(() => {
    if (!open) return
    const handleScroll = (e: Event) => {
      if ((e.target as Node) === document || (e.target as Node)?.contains?.(buttonRef.current)) close()
    }
    const handleResize = () => close()
    window.addEventListener('scroll', handleScroll, true)
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('scroll', handleScroll, true)
      window.removeEventListener('resize', handleResize)
    }
  }, [open])

  function choose(item: ActionsMenuItem) {
    if (item.disabled) return
    close()
    item.onClick()
  }

  return (
    <div className="inline-block text-left">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(!open)}
        aria-label={label}
        className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open &&
        pos &&
        createPortal(
          <>
            <div className="fixed inset-0" style={{ zIndex: PANEL_Z_INDEX }} onClick={close} />
            <div
              style={{ position: 'fixed', zIndex: PANEL_Z_INDEX + 1, ...pos }}
              className="min-w-40 rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
            >
              {items.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => choose(item)}
                  disabled={item.disabled}
                  title={item.title}
                  className={`block w-full whitespace-nowrap px-3 py-1.5 text-left text-xs font-medium hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-300 ${
                    item.variant === 'danger' ? 'text-status-danger-text' : 'text-sky-700'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </>,
          document.body,
        )}
    </div>
  )
}
