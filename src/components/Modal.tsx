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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
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
  )
}
