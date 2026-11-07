import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { animate } from 'animejs'
import { prefersReducedMotion } from '../lib/motion'

export function Modal({
  title,
  onClose,
  children,
  maxWidthClassName = 'max-w-md',
}: {
  title: string
  onClose: () => void
  children: ReactNode
  maxWidthClassName?: string
}) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)

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
    // scroll area. min-h-full keeps short modals vertically centred.
    <div ref={overlayRef} className="fixed inset-0 z-50 overflow-y-auto bg-black/35 backdrop-blur-xs">
      <div className="flex min-h-full items-center justify-center px-3 py-6 sm:px-4">
        <div ref={cardRef} className={`w-full ${maxWidthClassName} rounded-3xl bg-white p-5 shadow-xl sm:p-7`}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-xl font-medium text-gray-900">{title}</h2>
            <button onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-600 transition-colors duration-100 hover:bg-gray-200 hover:text-gray-900 pointer-coarse:h-11 pointer-coarse:w-11" aria-label="Close">
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}
