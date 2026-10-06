import { useState } from 'react'
import { Modal } from './Modal'

// Shows a public Google Form inside the Tracker instead of sending people off to a new tab.
// Only works for forms anyone can open: one that needs a Google sign-in can't be embedded,
// because Google's sign-in page refuses to load in a frame. The form is on Google's domain,
// so we can't see when it's been submitted; callers ask the person afterwards if they need to know.
export function EmbeddedFormModal({ title, url, onClose }: { title: string; url: string; onClose: () => void }) {
  const [loaded, setLoaded] = useState(false)
  const embedUrl = new URL(url)
  embedUrl.searchParams.set('embedded', 'true')

  return (
    <Modal title={title} onClose={onClose} maxWidthClassName="max-w-3xl">
      <div className="relative h-[70vh] overflow-hidden rounded-lg border border-gray-200 bg-white">
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400">Loading form...</div>
        )}
        <iframe
          src={embedUrl.toString()}
          title={title}
          onLoad={() => setLoaded(true)}
          className="h-full w-full"
        />
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-400 underline hover:text-gray-600">
          Form not loading? Open it in a new tab
        </a>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600"
        >
          Done
        </button>
      </div>
    </Modal>
  )
}
