import type { ReactNode } from 'react'
import { Search } from 'lucide-react'

/** Classes for a select or input sitting in a table toolbar, so every control lines up at the same height. */
export const toolbarControlClass =
  'h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 outline-none focus:border-accent'

/**
 * The strip of filters at the top of a table card. Give the first right-hand item `ml-auto`.
 * `standalone` draws it as its own card, for views with no table under it.
 */
export function TableToolbar({ children, standalone = false }: { children: ReactNode; standalone?: boolean }) {
  return (
    <div
      className={`flex flex-wrap items-center gap-2 px-4 py-3 ${
        standalone ? 'mb-4 rounded-xl border border-gray-200 bg-white' : 'border-b border-gray-200'
      }`}
    >
      {children}
    </div>
  )
}

/** A rounded card holding an optional toolbar and a table that scrolls sideways on narrow screens. */
export function TableCard({ toolbar, footer, children }: { toolbar?: ReactNode; footer?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      {toolbar}
      <div className="overflow-x-auto">{children}</div>
      {footer}
    </div>
  )
}

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  'aria-label'?: string
}

export function SearchInput({ value, onChange, placeholder = 'Search...', 'aria-label': ariaLabel }: SearchInputProps) {
  return (
    <div className="relative w-full sm:w-64">
      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden />
      <input
        type="search"
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${toolbarControlClass} w-full pl-9`}
      />
    </div>
  )
}

interface DateRangeInputProps {
  from: string
  to: string
  onFromChange: (value: string) => void
  onToChange: (value: string) => void
}

/** A from–to date pair drawn as one control, so it takes the room of a single filter. */
export function DateRangeInput({ from, to, onFromChange, onToChange }: DateRangeInputProps) {
  const dateClass = 'h-full bg-transparent px-2 text-sm text-gray-700 outline-none'
  return (
    <div className="flex h-9 items-center rounded-lg border border-gray-200 bg-white px-1 focus-within:border-accent">
      <input type="date" value={from} max={to || undefined} onChange={(e) => onFromChange(e.target.value)} aria-label="From date" className={dateClass} />
      <span className="text-xs text-gray-400">→</span>
      <input type="date" value={to} min={from || undefined} onChange={(e) => onToChange(e.target.value)} aria-label="To date" className={dateClass} />
    </div>
  )
}

/** Segmented buttons for switching between a few views or statuses. */
export function SegmentedTabs<T extends string>({
  value,
  onChange,
  options,
  'aria-label': ariaLabel,
}: {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: ReactNode; count?: number; title?: string }[]
  'aria-label': string
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="inline-flex h-9 items-center rounded-lg border border-gray-200 bg-white p-0.5">
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            title={option.title}
            onClick={() => onChange(option.value)}
            className={`h-full rounded-md px-3 text-sm font-medium ${
              active ? 'bg-accent-bg text-accent-foreground' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {option.label}
            {option.count !== undefined && <span className={`ml-1.5 text-xs ${active ? 'opacity-70' : 'text-gray-400'}`}>{option.count}</span>}
          </button>
        )
      })}
    </div>
  )
}
