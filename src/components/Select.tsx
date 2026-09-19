import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { animate } from 'animejs'
import { Check, ChevronDown } from 'lucide-react'
import { prefersReducedMotion } from '../lib/motion'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

interface SelectProps {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  /** Shown in the trigger when `value` matches no option (e.g. an action menu like "Set role..."). */
  placeholder?: string
  disabled?: boolean
  fullWidth?: boolean
  /** Classes for the trigger: border, padding, text size, focus styles. */
  className?: string
  /** Open immediately on mount, for inline editors that replace a static value. */
  autoOpen?: boolean
  /** Called whenever the panel closes, whether or not a value was chosen. */
  onClose?: () => void
  'aria-label'?: string
}

interface PanelPosition {
  top?: number
  bottom?: number
  left?: number
  right?: number
  minWidth: number
  maxWidth: number
  maxHeight: number
}

const OPTION_HEIGHT = 32
const PANEL_PADDING = 8
const MAX_PANEL_HEIGHT = 260
const EDGE_GAP = 8
// Above Modal's z-50, so a dropdown opened inside a modal isn't covered by it.
const PANEL_Z_INDEX = 60

function nextEnabled(options: SelectOption[], from: number, step: 1 | -1): number {
  for (let i = from + step; i >= 0 && i < options.length; i += step) {
    if (!options[i].disabled) return i
  }
  return from < 0 || from >= options.length ? -1 : from
}

function initialActiveIndex(options: SelectOption[], value: string): number {
  const selected = options.findIndex((o) => o.value === value && !o.disabled)
  return selected >= 0 ? selected : nextEnabled(options, -1, 1)
}

// Native <select> popups are drawn by the OS, so on Windows they stay white in
// dark mode while their text inherits the (light) themed color. This draws the
// list from the same theme tokens as the rest of the app instead.
export function Select({
  value,
  onChange,
  options,
  placeholder,
  disabled,
  fullWidth,
  className = '',
  autoOpen = false,
  onClose,
  'aria-label': ariaLabel,
}: SelectProps) {
  const id = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const typeahead = useRef({ text: '', timer: 0 })
  const scrollOnActive = useRef(true)
  const [open, setOpen] = useState(autoOpen && !disabled)
  const [activeIndex, setActiveIndex] = useState(() => initialActiveIndex(options, value))
  const [pos, setPos] = useState<PanelPosition | null>(null)

  const selected = options.find((o) => o.value === value)
  const label = selected?.label ?? placeholder ?? ''

  const close = useCallback(
    (refocus: boolean) => {
      setOpen(false)
      setPos(null)
      onClose?.()
      if (refocus) triggerRef.current?.focus()
    },
    [onClose],
  )

  // Fixed-position panel: measured against the trigger so it flips upward near
  // the bottom of the screen and never gets clipped by a table or modal.
  useLayoutEffect(() => {
    const trigger = triggerRef.current
    if (!open || !trigger) return
    const rect = trigger.getBoundingClientRect()
    const desired = Math.min(options.length * OPTION_HEIGHT + PANEL_PADDING, MAX_PANEL_HEIGHT)
    const below = window.innerHeight - rect.bottom - EDGE_GAP
    const above = rect.top - EDGE_GAP
    const openUp = below < desired && above > below
    const anchorRight = rect.left > window.innerWidth / 2
    setPos({
      ...(openUp ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
      ...(anchorRight ? { right: window.innerWidth - rect.right } : { left: rect.left }),
      minWidth: rect.width,
      maxWidth: window.innerWidth - EDGE_GAP * 2,
      maxHeight: Math.min(MAX_PANEL_HEIGHT, Math.max(120, openUp ? above : below)),
    })
  }, [open, options.length])

  const panelVisible = open && pos !== null
  const openUp = pos?.bottom !== undefined
  useLayoutEffect(() => {
    const panel = panelRef.current
    if (!panelVisible || !panel || prefersReducedMotion()) return
    const animation = animate(panel, {
      opacity: [0, 1],
      translateY: [openUp ? 6 : -6, 0],
      duration: 140,
      ease: 'outCubic',
      onComplete: (a) => a.revert(),
    })
    return () => {
      animation.revert()
    }
  }, [panelVisible, openUp])

  useEffect(() => {
    if (!open) return
    const handleScroll = (e: Event) => {
      if (panelRef.current?.contains(e.target as Node)) return
      close(false)
    }
    const handleResize = () => close(false)
    window.addEventListener('scroll', handleScroll, true)
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('scroll', handleScroll, true)
      window.removeEventListener('resize', handleResize)
    }
  }, [open, close])

  useEffect(() => {
    if (!open || !pos || activeIndex < 0 || !scrollOnActive.current) return
    document.getElementById(`${id}-opt-${activeIndex}`)?.scrollIntoView({ block: 'nearest' })
  }, [open, pos, activeIndex, id])

  useEffect(() => {
    const ta = typeahead.current
    return () => window.clearTimeout(ta.timer)
  }, [])

  function openPanel() {
    if (disabled) return
    scrollOnActive.current = true
    setActiveIndex(initialActiveIndex(options, value))
    setOpen(true)
  }

  function choose(index: number) {
    const option = options[index]
    if (!option || option.disabled) return
    onChange(option.value)
    close(true)
  }

  function typeAhead(char: string) {
    const ta = typeahead.current
    window.clearTimeout(ta.timer)
    ta.text += char.toLowerCase()
    ta.timer = window.setTimeout(() => {
      ta.text = ''
    }, 600)
    const match = options.findIndex((o) => !o.disabled && o.label.toLowerCase().startsWith(ta.text))
    if (match >= 0) setActiveIndex(match)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        openPanel()
      }
      return
    }
    scrollOnActive.current = true
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setActiveIndex((i) => nextEnabled(options, i, 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setActiveIndex((i) => nextEnabled(options, i, -1))
        break
      case 'Home':
        e.preventDefault()
        setActiveIndex(nextEnabled(options, -1, 1))
        break
      case 'End':
        e.preventDefault()
        setActiveIndex(nextEnabled(options, options.length, -1))
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        choose(activeIndex)
        break
      case 'Escape':
        e.preventDefault()
        e.stopPropagation()
        close(true)
        break
      case 'Tab':
        close(false)
        break
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) typeAhead(e.key)
    }
  }

  return (
    <div className={`relative ${fullWidth ? 'block w-full' : 'inline-block'}`}>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        aria-activedescendant={open && activeIndex >= 0 ? `${id}-opt-${activeIndex}` : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        autoFocus={autoOpen}
        onClick={() => (open ? close(false) : openPanel())}
        onKeyDown={handleKeyDown}
        onKeyUp={(e) => {
          if (e.key === ' ') e.preventDefault()
        }}
        className={`flex items-center justify-between gap-2 text-left disabled:cursor-not-allowed ${
          fullWidth ? 'w-full' : ''
        } ${className}`}
      >
        {/* Invisible copies of every label size the trigger to the widest one, like a native
            select, so it doesn't change width as the selection changes. */}
        <span className="grid min-w-0">
          <span className="col-start-1 row-start-1 truncate">{label}</span>
          {!fullWidth &&
            [...options.map((o) => o.label), placeholder ?? ''].map((l, i) => (
              <span
                key={i}
                aria-hidden
                className="invisible col-start-1 row-start-1 h-0 overflow-hidden whitespace-nowrap"
              >
                {l}
              </span>
            ))}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
      </button>

      {open &&
        pos &&
        createPortal(
          <>
            <div className="fixed inset-0" style={{ zIndex: PANEL_Z_INDEX }} onClick={() => close(false)} />
            <div
              ref={panelRef}
              id={`${id}-list`}
              role="listbox"
              style={{ position: 'fixed', zIndex: PANEL_Z_INDEX + 1, ...pos }}
              className="overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
            >
              {options.length === 0 && <div className="px-3 py-2 text-sm text-gray-400">No options</div>}
              {options.map((o, i) => {
                const isSelected = o.value === value
                return (
                  <div
                    key={o.value}
                    id={`${id}-opt-${i}`}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={o.disabled || undefined}
                    onMouseEnter={() => {
                      if (o.disabled) return
                      scrollOnActive.current = false
                      setActiveIndex(i)
                    }}
                    onClick={() => choose(i)}
                    className={`flex items-center justify-between gap-3 px-3 py-1.5 text-sm ${
                      i === activeIndex ? 'bg-gray-100' : ''
                    } ${isSelected ? 'font-bold text-gray-900' : 'text-gray-700'} ${
                      o.disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
                    }`}
                  >
                    <span className="whitespace-nowrap">{o.label}</span>
                    {isSelected && <Check className="h-3.5 w-3.5 shrink-0" />}
                  </div>
                )
              })}
            </div>
          </>,
          document.body,
        )}
    </div>
  )
}
