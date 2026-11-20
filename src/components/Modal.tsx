import { useId, useLayoutEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { animate } from 'animejs'
import { prefersReducedMotion } from '../lib/motion'

export function Modal({
  title,
  onClose,
  children,
  maxWidthClassName = 'max-w-md',
  hideClose = false,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  maxWidthClassName?: string
  /** Leaves out the corner ✕, for a modal that only closes through its own buttons (e.g. after a confirmation). */
  hideClose?: boolean
}) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  // Reverted on completion so no lingering transform turns the card into the
  // containing block for position: fixed descendants (e.g. Combobox's backdrop).
  useLayoutEffect(() => {
    const overlay = overlayRef.current
    const card = cardRef.current
    if (!overlay || !card || prefersReducedMotion()) return
    const animations = [
      animate(overlay, { opacity: [0, 1], duration: 180, ease: 'outQuad', onComplete: (a) => a.revert() }),
      animate(card, {
        opacity: [0, 1],
        translateY: [16, 0],
        scale: [0.96, 1],
        duration: 260,
        ease: 'outCubic',
        onComplete: (a) => a.revert(),
      }),
    ]
    return () => animations.forEach((a) => a.revert())
  }, [])

  return (
    // The overlay scrolls (not the card) so a tall form on a short screen stays
    // reachable, while dropdowns inside the card aren't clipped by an inner
    // scroll area. On phones the card docks to the bottom as a sheet; from sm up
    // min-h-full keeps short modals vertically centred.
    <div ref={overlayRef} className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-black/35 backdrop-blur-xs">
      <div className="flex min-h-full items-end justify-center pt-10 sm:items-center sm:px-4 sm:py-6">
        <div
          ref={cardRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className={`w-full ${maxWidthClassName} rounded-t-2xl bg-white px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl sm:rounded-3xl sm:px-7 sm:pb-7`}
        >
          <div className="sticky top-0 z-10 -mx-4 mb-4 flex items-center justify-between gap-3 rounded-t-2xl bg-white px-4 pb-3 pt-4 sm:static sm:mx-0 sm:rounded-none sm:px-0 sm:pb-0 sm:pt-7">
            <h2 id={titleId} className="min-w-0 font-display text-lg font-medium text-gray-900 sm:text-xl">{title}</h2>
            {!hideClose && <button onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600 transition-colors duration-100 hover:bg-gray-200 hover:text-gray-900 pointer-coarse:h-11 pointer-coarse:w-11" aria-label="Close">
              <X className="h-4 w-4" aria-hidden />
            </button>}
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}
