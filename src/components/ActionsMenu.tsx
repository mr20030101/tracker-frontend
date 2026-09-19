import { useRef, useState } from 'react'
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
}

function getScrollBoundary(el: HTMLElement): number {
  let node: HTMLElement | null = el.parentElement
  while (node) {
    const overflowY = getComputedStyle(node).overflowY
    if (overflowY === 'hidden' || overflowY === 'auto' || overflowY === 'scroll') {
      return node.getBoundingClientRect().bottom
    }
    node = node.parentElement
  }
  return window.innerHeight
}

export function ActionsMenu({ items, label = 'Actions' }: ActionsMenuProps) {
  const [open, setOpen] = useState(false)
  const [openUpward, setOpenUpward] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)

  function toggleOpen() {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      const panelHeight = items.length * 30 + 12
      setOpenUpward(getScrollBoundary(buttonRef.current) - rect.bottom < panelHeight && rect.top > panelHeight)
    }
    setOpen((v) => !v)
  }

  function choose(item: ActionsMenuItem) {
    if (item.disabled) return
    setOpen(false)
    item.onClick()
  }

  return (
    <div className="relative inline-block text-left">
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleOpen}
        aria-label={label}
        className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className={`absolute right-0 z-20 min-w-[10rem] rounded-lg border border-gray-200 bg-white py-1 shadow-lg ${
              openUpward ? 'bottom-full mb-1' : 'top-full mt-1'
            }`}
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
        </>
      )}
    </div>
  )
}
