import { Children, Fragment, isValidElement, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { useStretchyPill } from '../lib/useStretchyPill'
import { ChevronDown, Search, SlidersHorizontal } from 'lucide-react'

/** Classes for a select or input in a filter bar, so every control lines up at the same height. */
export const toolbarControlClass =
  'h-10 pointer-coarse:h-11 rounded-full border border-gray-200 bg-white px-4 text-sm text-gray-700 outline-none transition-colors duration-100 focus:border-gray-900'

/** Flattens fragments so each filter counts once, wherever a page groups them. */
function filterFields(children: ReactNode): ReactNode[] {
  return Children.toArray(children).flatMap((child) =>
    isValidElement<{ children?: ReactNode }>(child) && child.type === Fragment ? filterFields(child.props.children) : [child],
  )
}

const ROW_COLUMNS = 4

function firstRowCount(fields: ReactNode[]): number {
  let columns = 0
  let count = 0
  for (const field of fields) {
    const props = isValidElement<{ wide?: boolean; full?: boolean }>(field) ? field.props : {}
    columns += props.full ? ROW_COLUMNS : props.wide ? 2 : 1
    if (columns > ROW_COLUMNS) break
    count += 1
  }
  return Math.max(1, count)
}

/**
 * Every filter for a table in its own card above it, each with its label over the control, four
 * to a row on a wide screen, two on a tablet, one on a phone. A header row holds the title, any
 * actions (Export, a count) and Reset, so they line up with each other rather than with a label.
 * Filters past the first row (four columns, a `wide` one counting as two) fold behind "More filters"; it opens by itself when one of them
 * is set (FilterField `set`), so a filter is never hidden while it applies. Reset stays in place
 * and dims while nothing is set.
 */
export function FilterBar({
  children,
  active = 0,
  onReset,
  actions,
  visible,
}: {
  children: ReactNode
  /** How many filters are set away from their default; Reset applies while it's above 0. */
  active?: number
  onReset?: () => void
  actions?: ReactNode
  /** How many filters show before "More filters"; by default, as many as fill the first row. */
  visible?: number
}) {
  const fields = filterFields(children)
  const shown = visible ?? firstRowCount(fields)
  const extra = fields.slice(shown)
  const extraSet = extra.filter((field) => isValidElement<{ set?: boolean }>(field) && field.props.set).length
  const [expanded, setExpanded] = useState(extraSet > 0)
  const open = expanded || extraSet > 0
  const panelId = useId()

  return (
    <div className="mb-4 px-4 pb-4 pt-3 card">
      <div className="mb-3 flex min-h-8 flex-wrap items-center gap-x-1 gap-y-1">
        <span className="mr-auto inline-flex items-center gap-2 text-sm font-semibold text-gray-900">
          <SlidersHorizontal className="h-4 w-4 text-gray-500" aria-hidden />
          Filters
          {active > 0 && <span className="rounded-full bg-accent-bg px-1.5 text-xs font-semibold text-accent-on-bg">{active}</span>}
        </span>
        {actions}
        {extra.length > 0 && (
          <FilterAction aria-expanded={open} aria-controls={panelId} onClick={() => setExpanded(!open)} disabled={extraSet > 0}>
            <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} aria-hidden />
            {open ? 'Fewer filters' : `More filters (${extra.length})`}
          </FilterAction>
        )}
        {onReset && (
          <button
            type="button"
            onClick={onReset}
            disabled={active === 0}
            className="inline-flex h-8 pointer-coarse:h-11 items-center rounded-md px-2 text-xs font-semibold text-accent-text transition-colors duration-100 hover:bg-accent-bg disabled:pointer-events-none disabled:text-gray-300"
          >
            Reset
          </button>
        )}
      </div>
      <div id={panelId} className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {fields.slice(0, shown)}
        {open && extra}
      </div>
    </div>
  )
}

/** One labelled filter in a FilterBar. Pass the control's `id` so the label names it, and `set` while it's away from its default. */
export function FilterField({
  label,
  id,
  wide = false,
  full = false,
  children,
}: {
  label: string
  id?: string
  /** Two columns wide, for a from–to pair or a long segmented control. */
  wide?: boolean
  /** The whole row. */
  full?: boolean
  set?: boolean
  children: ReactNode
}) {
  const labelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500'
  return (
    <div className={`filter-field min-w-0 ${full ? 'sm:col-span-2 xl:col-span-4' : wide ? 'sm:col-span-2' : ''}`}>
      {id ? (
        <label htmlFor={id} className={labelClass}>
          {label}
        </label>
      ) : (
        <span className={labelClass}>{label}</span>
      )}
      {children}
    </div>
  )
}

/** A small text button for the FilterBar's header (Export and the like). */
export function FilterAction({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className="inline-flex h-8 pointer-coarse:h-11 items-center gap-1.5 rounded-md px-2 text-xs font-semibold text-gray-600 transition-colors duration-100 hover:bg-gray-100 hover:text-gray-900 disabled:pointer-events-none disabled:text-gray-300"
    >
      {children}
    </button>
  )
}

/** A rounded card holding a table that scrolls sideways on narrow screens, with its filters (`toolbar`) above it. */
export function TableCard({ toolbar, footer, children }: { toolbar?: ReactNode; footer?: ReactNode; children: ReactNode }) {
  return (
    <>
      {toolbar}
      <div className="card">
        <div className="overflow-x-auto">{children}</div>
        {footer}
      </div>
    </>
  )
}

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  'aria-label'?: string
  id?: string
}

export function SearchInput({ value, onChange, placeholder = 'Search...', 'aria-label': ariaLabel, id }: SearchInputProps) {
  return (
    <div className="relative w-full sm:w-64">
      <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden />
      <input
        id={id}
        type="search"
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${toolbarControlClass} w-full pl-10`}
      />
    </div>
  )
}

interface DateRangeInputProps {
  from: string
  to: string
  onFromChange: (value: string) => void
  onToChange: (value: string) => void
  /** The From input's id, so a label names the pair. */
  id?: string
}

/** A from–to date pair drawn as one control, so it takes the room of a single filter. */
export function DateRangeInput({ from, to, onFromChange, onToChange, id }: DateRangeInputProps) {
  const dateClass = 'h-full min-w-0 flex-1 bg-transparent px-2 text-sm text-gray-700 outline-none'
  return (
    <div className="flex h-10 pointer-coarse:h-11 items-center rounded-full border border-gray-200 bg-white px-2 focus-within:border-gray-900">
      <input id={id} type="date" value={from} max={to || undefined} onChange={(e) => onFromChange(e.target.value)} aria-label="From date" className={dateClass} />
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
  const listRef = useRef<HTMLDivElement>(null)
  const pill = useStretchyPill(listRef, '[aria-selected="true"]', 'x', [value, options.length])
  return (
    <div ref={listRef} role="tablist" aria-label={ariaLabel} className="relative inline-flex h-10 pointer-coarse:h-11 items-center rounded-full border border-gray-200 bg-white p-1">
      <span aria-hidden className="pointer-events-none rounded-full bg-ink" style={pill} />
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
            className={`relative h-full rounded-full px-4 text-sm font-medium transition-colors duration-300 ${
              active ? 'text-ink-foreground' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {option.label}
            {option.count !== undefined && <span className="ml-1.5 text-xs text-gray-400">{option.count}</span>}
          </button>
        )
      })}
    </div>
  )
}
