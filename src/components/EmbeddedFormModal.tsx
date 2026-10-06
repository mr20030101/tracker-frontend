import { useRef, useState, type ReactNode } from 'react'
import { Modal } from './Modal'

// Shows a public Google Form inside the Tracker instead of sending people off to a new tab.
// Only works for forms anyone can open: one that needs a Google sign-in can't be embedded,
// because Google's sign-in page refuses to load in a frame.
//
// onSubmitted: the form is on Google's domain, so we can't read it, but the frame fires `load`
// once for the form and again when Submit takes it to Google's "response recorded" page.
// Required fields are checked in the page without reloading, so for a single-page form (no
// "Next" sections, which would load again on each page) the second load means it was sent.
// If they fall back to a new tab we can't see that, so they're offered a button to say so.
export function EmbeddedFormModal({
  title,
  url,
  onClose,
  onSubmitted,
  status,
}: {
  title: string
  url: string
  onClose: () => void
  onSubmitted?: () => void
  /** Shown beside the Done button, e.g. how saving the submission went. */
  status?: ReactNode
}) {
  const [loaded, setLoaded] = useState(false)
  const [openedInTab, setOpenedInTab] = useState(false)
  const loadCount = useRef(0)
  const submitted = useRef(false)
  const [wasSubmitted, setWasSubmitted] = useState(false)
  const embedUrl = new URL(url)
  embedUrl.searchParams.set('embedded', 'true')

  function markSubmitted() {
    if (submitted.current) return
    submitted.current = true
    setWasSubmitted(true)
    onSubmitted?.()
  }

  function handleLoad() {
    setLoaded(true)
    loadCount.current += 1
    if (loadCount.current === 2) markSubmitted()
  }

  return (
    <Modal title={title} onClose={onClose} maxWidthClassName="max-w-3xl">
      <div className="relative h-[70vh] overflow-hidden rounded-lg border border-gray-200 bg-white">
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400">Loading form...</div>
        )}
        <iframe src={embedUrl.toString()} title={title} onLoad={handleLoad} className="h-full w-full" />
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        {openedInTab && onSubmitted && !wasSubmitted ? (
          <button type="button" onClick={markSubmitted} className="text-xs font-semibold text-accent underline">
            Submitted it in the new tab? Mark it as submitted
          </button>
        ) : (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpenedInTab(true)}
            className="text-xs text-gray-400 underline hover:text-gray-600"
          >
            Form not loading? Open it in a new tab
          </a>
        )}
        <div className="flex items-center gap-3">
          {status}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600"
          >
            Done
          </button>
        </div>
      </div>
    </Modal>
  )
}
