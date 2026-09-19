import { useLayoutEffect, useRef, type ReactNode } from 'react'
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
    <div ref={overlayRef} className="fixed inset-0 z-50 overflow-y-auto bg-black/30">
      <div className="flex min-h-full items-center justify-center px-4 py-6">
        <div ref={cardRef} className={`w-full ${maxWidthClassName} rounded-2xl bg-white p-6 shadow-xl`}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700" aria-label="Close">
              ✕
            </button>
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}
