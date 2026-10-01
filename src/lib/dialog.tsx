import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import { animate } from 'animejs'
import { CircleAlert, TriangleAlert } from 'lucide-react'
import { prefersReducedMotion } from './motion'

// Themed stand-ins for window.confirm / window.alert. They return promises, so a call site reads
// almost the same as before: `if (await confirmDialog('Delete this?', { confirmLabel: 'Delete', danger: true }))`.
// Callable from anywhere (no hook); <DialogHost /> in main.tsx renders them one at a time.

interface DialogOptions {
  title?: string
  confirmLabel?: string
  cancelLabel?: string
  /** Red confirm button and a warning icon, for actions that delete or remove something. */
  danger?: boolean
}

interface DialogRequest extends Required<Omit<DialogOptions, 'cancelLabel'>> {
  id: number
  kind: 'confirm' | 'alert'
  message: string
  cancelLabel: string
  resolve: (confirmed: boolean) => void
}

let queue: DialogRequest[] = []
let nextId = 0
const listeners = new Set<() => void>()

function setQueue(next: DialogRequest[]) {
  queue = next
  listeners.forEach((listener) => listener())
}

function open(request: Omit<DialogRequest, 'id' | 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => setQueue([...queue, { ...request, id: nextId++, resolve }]))
}

export function confirmDialog(message: string, options: DialogOptions = {}): Promise<boolean> {
  return open({
    kind: 'confirm',
    message,
    title: options.title ?? 'Are you sure?',
    confirmLabel: options.confirmLabel ?? 'OK',
    cancelLabel: options.cancelLabel ?? 'Cancel',
    danger: options.danger ?? false,
  })
}

export async function alertDialog(message: string, options: Omit<DialogOptions, 'cancelLabel'> = {}): Promise<void> {
  await open({
    kind: 'alert',
    message,
    title: options.title ?? 'Something went wrong',
    confirmLabel: options.confirmLabel ?? 'OK',
    cancelLabel: '',
    danger: options.danger ?? false,
  })
}

function Dialog({ request, onDone }: { request: DialogRequest; onDone: (confirmed: boolean) => void }) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  // Same entrance as Modal.
  useLayoutEffect(() => {
    const overlay = overlayRef.current
    const card = cardRef.current
    if (!overlay || !card || prefersReducedMotion()) return
    const animations = [
      animate(overlay, { opacity: [0, 1], duration: 160, ease: 'outQuad', onComplete: (a) => a.revert() }),
      animate(card, { opacity: [0, 1], translateY: [12, 0], scale: [0.95, 1], duration: 240, ease: 'outCubic', onComplete: (a) => a.revert() }),
    ]
    return () => animations.forEach((a) => a.revert())
  }, [])

  // A destructive action starts on Cancel, so a stray Enter doesn't delete anything.
  useEffect(() => {
    ;(request.danger && cancelRef.current ? cancelRef.current : confirmRef.current)?.focus()
  }, [request])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onDone(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDone])

  const Icon = request.danger ? TriangleAlert : CircleAlert

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onDone(false)
      }}
    >
      <div
        ref={cardRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby="dialog-message"
        className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl"
      >
        <div
          className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full ${
            request.danger ? 'bg-status-danger-bg text-status-danger-text' : 'bg-accent-bg text-accent-foreground'
          }`}
        >
          <Icon className="h-6 w-6" />
        </div>
        <h2 id="dialog-title" className="text-lg font-semibold text-gray-900">
          {request.title}
        </h2>
        <p id="dialog-message" className="mt-2 text-sm text-gray-500">
          {request.message}
        </p>
        <div className="mt-6 flex gap-3">
          {request.kind === 'confirm' && (
            <button
              ref={cancelRef}
              type="button"
              onClick={() => onDone(false)}
              className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              {request.cancelLabel}
            </button>
          )}
          <button
            ref={confirmRef}
            type="button"
            onClick={() => onDone(true)}
            // Explicit hex text: the dark theme remaps --color-white to a dark colour.
            className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-semibold ${
              request.danger ? 'bg-red-600 text-[#ffffff] hover:bg-red-700' : 'bg-accent text-accent-foreground hover:opacity-90'
            }`}
          >
            {request.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export function DialogHost() {
  const current = useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange)
      return () => listeners.delete(onChange)
    },
    () => queue[0],
  )
  if (!current) return null
  return (
    <Dialog
      key={current.id}
      request={current}
      onDone={(confirmed) => {
        setQueue(queue.slice(1))
        current.resolve(confirmed)
      }}
    />
  )
}
