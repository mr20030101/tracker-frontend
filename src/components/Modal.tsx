import type { ReactNode } from 'react'

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
  return (
    // The overlay scrolls (not the card) so a tall form on a short screen stays
    // reachable, while dropdowns inside the card aren't clipped by an inner
    // scroll area. min-h-full keeps short modals vertically centred.
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/30">
      <div className="flex min-h-full items-center justify-center px-4 py-6">
        <div className={`w-full ${maxWidthClassName} rounded-2xl bg-white p-6 shadow-xl`}>
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
