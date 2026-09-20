import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface ComboboxOption {
  value: string
  label: string
}

interface ComboboxProps {
  value: string
  onChange: (value: string) => void
  options: ComboboxOption[]
  placeholder?: string
  emptyLabel?: string
  className?: string
}

interface PanelPosition {
  top?: number
  bottom?: number
  left: number
  maxHeight: number
}

const PANEL_WIDTH = 224
const PANEL_HEIGHT = 280
const EDGE_GAP = 8
// Above Modal's z-50, so the panel isn't covered when opened inside a modal.
const PANEL_Z_INDEX = 60

export function Combobox({
  value,
  onChange,
  options,
  placeholder = 'Search...',
  emptyLabel = '— None —',
  className = '',
}: ComboboxProps) {
  const [pos, setPos] = useState<PanelPosition | null>(null)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const open = pos !== null

  const selected = options.find((o) => o.value === value)
  const filtered = useMemo(
    () => options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase())),
    [options, query],
  )

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus())
  }, [open])

  // The panel is fixed-positioned against the viewport, so it can't be clipped by
  // a table's overflow or trapped in a scroll area, and any scroll or resize
  // would leave it stranded from its trigger.
  useEffect(() => {
    if (!open) return
    const handleScroll = (e: Event) => {
      if (panelRef.current?.contains(e.target as Node)) return
      setPos(null)
    }
    const handleResize = () => setPos(null)
    window.addEventListener('scroll', handleScroll, true)
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('scroll', handleScroll, true)
      window.removeEventListener('resize', handleResize)
    }
  }, [open])

  function select(v: string) {
    onChange(v)
    setPos(null)
  }

  function toggleOpen() {
    if (open) {
      setPos(null)
      return
    }
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return
    const below = window.innerHeight - rect.bottom - EDGE_GAP
    const above = rect.top - EDGE_GAP
    const openUp = below < PANEL_HEIGHT && above > below
    setQuery('')
    setPos({
      ...(openUp ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
      left: Math.max(EDGE_GAP, Math.min(rect.left, window.innerWidth - PANEL_WIDTH - EDGE_GAP)),
      maxHeight: Math.min(PANEL_HEIGHT, Math.max(140, openUp ? above : below)),
    })
  }

  return (
    <div className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleOpen}
        className="w-full truncate rounded-lg border border-gray-200 bg-white px-2 py-1 text-left text-xs outline-none focus:border-accent"
      >
        {selected?.label ?? emptyLabel}
      </button>

      {open &&
        createPortal(
          <>
            <div className="fixed inset-0" style={{ zIndex: PANEL_Z_INDEX }} onClick={() => setPos(null)} />
            <div
              ref={panelRef}
              style={{ position: 'fixed', zIndex: PANEL_Z_INDEX + 1, width: PANEL_WIDTH, ...pos }}
              className="flex flex-col rounded-lg border border-gray-200 bg-white shadow-lg"
            >
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setPos(null)
                  if (e.key === 'Enter' && filtered.length > 0) select(filtered[0].value)
                }}
                placeholder={placeholder}
                className="w-full shrink-0 border-b border-gray-100 bg-transparent px-3 py-2 text-xs outline-none"
              />
              <div className="min-h-0 flex-1 overflow-y-auto py-1">
                <button
                  type="button"
                  onClick={() => select('')}
                  className={`block w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50 ${
                    value === '' ? 'font-bold text-gray-900' : 'text-gray-600'
                  }`}
                >
                  {emptyLabel}
                </button>
                {filtered.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => select(o.value)}
                    className={`block w-full truncate px-3 py-1.5 text-left text-xs hover:bg-gray-50 ${
                      value === o.value ? 'font-bold text-gray-900' : 'text-gray-700'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
                {filtered.length === 0 && <div className="px-3 py-2 text-xs text-gray-400">No matches.</div>}
              </div>
            </div>
          </>,
          document.body,
        )}
    </div>
  )
}
