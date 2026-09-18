import { useEffect, useMemo, useRef, useState } from 'react'

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

export function Combobox({
  value,
  onChange,
  options,
  placeholder = 'Search...',
  emptyLabel = '— None —',
  className = '',
}: ComboboxProps) {
  const [open, setOpen] = useState(false)
  const [openUpward, setOpenUpward] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const selected = options.find((o) => o.value === value)
  const filtered = useMemo(
    () => options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase())),
    [options, query],
  )

  useEffect(() => {
    if (open) {
      setQuery('')
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  function select(v: string) {
    onChange(v)
    setOpen(false)
  }

  function toggleOpen() {
    if (!open && buttonRef.current) {
      const { bottom, top } = buttonRef.current.getBoundingClientRect()
      const panelHeight = 280
      setOpenUpward(window.innerHeight - bottom < panelHeight && top > panelHeight)
    }
    setOpen((v) => !v)
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

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className={`absolute left-0 z-20 w-56 rounded-lg border border-gray-200 bg-white shadow-lg ${
              openUpward ? 'bottom-full mb-1' : 'top-full mt-1'
            }`}
          >
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setOpen(false)
                if (e.key === 'Enter' && filtered.length > 0) select(filtered[0].value)
              }}
              placeholder={placeholder}
              className="w-full border-b border-gray-100 px-3 py-2 text-xs outline-none"
            />
            <div className="max-h-56 overflow-y-auto py-1">
              <button
                type="button"
                onClick={() => select('')}
                className={`block w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50 ${
                  value === '' ? 'font-semibold text-accent-foreground' : 'text-gray-600'
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
                    value === o.value ? 'font-semibold text-accent-foreground' : 'text-gray-700'
                  }`}
                >
                  {o.label}
                </button>
              ))}
              {filtered.length === 0 && <div className="px-3 py-2 text-xs text-gray-400">No matches.</div>}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
