import { useEffect, useId, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X, type LucideIcon } from 'lucide-react'

// A playful, centred card for a moment worth stopping for: the no-submissions nudge, a goal or
// badge celebration, the weekly recap. An icon in a spinning ring sits on its top edge. It stays
// until it's closed (×, Escape or the backdrop) or its button is used. Rendered into <body> so a
// page's reveal animation (a transform on an ancestor) can't pull it off centre.

export interface SpotlightAction {
  label: string
  onClick: () => void
  icon?: LucideIcon
}

export function SpotlightDialog({
  icon: Icon,
  title,
  children,
  primary,
  secondary,
  onClose,
}: {
  icon: LucideIcon
  title: ReactNode
  children?: ReactNode
  primary?: SpotlightAction
  secondary?: SpotlightAction
  onClose: () => void
}) {
  const titleId = useId()

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="nudge-in relative w-full max-w-sm rounded-2xl border border-gray-200 bg-white px-6 pb-6 pt-12 text-center shadow-xl"
      >
        {/* The badge sits half above the card's top edge. */}
        <div className="absolute -top-9 left-1/2 h-[72px] w-[72px] -translate-x-1/2 rounded-full bg-white text-accent shadow-md">
          <svg viewBox="0 0 72 72" className="absolute inset-0" aria-hidden="true">
            <circle cx="36" cy="36" r="27" className="fill-current opacity-10" />
            <g className="nudge-spin">
              <circle cx="36" cy="36" r="32" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="10 9" />
              <circle cx="36" cy="4" r="3.5" fill="currentColor" />
              <circle cx="64" cy="52" r="2.5" fill="currentColor" opacity="0.7" />
              <circle cx="8" cy="52" r="2" fill="currentColor" opacity="0.5" />
            </g>
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <Icon className="nudge-bob h-7 w-7" aria-hidden="true" />
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <p id={titleId} className="text-base font-bold text-gray-900">
          {title}
        </p>
        {children && <div className="mt-1 text-sm text-gray-600">{children}</div>}
        {(primary || secondary) && (
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {secondary && (
              <button
                type="button"
                onClick={secondary.onClick}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                {secondary.icon && <secondary.icon className="h-4 w-4" aria-hidden />}
                {secondary.label}
              </button>
            )}
            {primary && (
              <button
                type="button"
                onClick={primary.onClick}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
              >
                {primary.icon && <primary.icon className="h-4 w-4" aria-hidden />}
                {primary.label}
              </button>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
