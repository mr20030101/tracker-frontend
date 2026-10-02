import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { APP_VERSION } from '../lib/version'
import { boldSegments, parseChangelog, type Release } from '../lib/changelog'
import { Modal } from './Modal'

// The footer under every page's content — signed in or not — stating the build's version.
// Inside the app (`releaseNotes`) the version opens "What's new": CHANGELOG.md, bundled at build
// time, so the notes always match the version that opened them. On public pages (sign-in, the
// application form, donations) it's plain text: the release notes describe the app's internals
// and aren't for people outside the team. Off unless asked for, so a new public page is safe.

// Loaded only when "What's new" is opened, as its own file, so public pages (which never show
// it) don't download the release notes at all.
function useReleases(): Release[] | null {
  const [releases, setReleases] = useState<Release[] | null>(null)
  useEffect(() => {
    let cancelled = false
    import('../../CHANGELOG.md?raw').then(({ default: changelog }) => {
      if (!cancelled) setReleases(parseChangelog(changelog))
    })
    return () => {
      cancelled = true
    }
  }, [])
  return releases
}

function Text({ value }: { value: string }) {
  return boldSegments(value).map((segment, index) =>
    segment.bold ? <strong key={index}>{segment.value}</strong> : <span key={index}>{segment.value}</span>,
  )
}

function WhatsNew({ onClose }: { onClose: () => void }) {
  const releases = useReleases()
  return (
    <Modal title="What's new" onClose={onClose} maxWidthClassName="max-w-2xl">
      <div className="max-h-[70vh] space-y-6 overflow-y-auto pr-1 text-sm">
        {releases === null && <p className="text-gray-400">Loading...</p>}
        {releases?.length === 0 && <p className="text-gray-600">No release notes yet.</p>}

        {(releases ?? []).map((release) => (
          <section key={release.version}>
            <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-gray-200 pb-1">
              <h3 className="text-base font-semibold text-gray-900">v{release.version}</h3>
              {release.date && <span className="text-xs text-gray-500">{release.date}</span>}
              {release.version === APP_VERSION && <span className="text-xs font-semibold text-accent">This version</span>}
            </div>

            {release.notes.map((note) => (
              <p key={note} className="mb-2 text-gray-600">
                <Text value={note} />
              </p>
            ))}

            {release.groups.map((group) => (
              <div key={group.title} className="mb-3">
                <p className="mb-1 font-semibold text-gray-900">{group.title}</p>
                <ul className="list-disc space-y-1 pl-5 text-gray-700">
                  {group.items.map((item) => (
                    <li key={item}>
                      <Text value={item} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        ))}
      </div>
    </Modal>
  )
}

export function AppFooter({ className = '', releaseNotes = false }: { className?: string; releaseNotes?: boolean }) {
  const [showNotes, setShowNotes] = useState(false)

  return (
    <footer className={`flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-gray-400 ${className}`}>
      <span>&copy; {new Date().getFullYear()} Grey Owls Tracker</span>
      <span aria-hidden="true">&bull;</span>
      {releaseNotes ? (
        <button
          type="button"
          onClick={() => setShowNotes(true)}
          title="What's new"
          className="tabular-nums hover:text-gray-700 hover:underline"
        >
          v{APP_VERSION}
        </button>
      ) : (
        <span className="tabular-nums">v{APP_VERSION}</span>
      )}
      {/* Portaled, so a footer inside a transformed or clipped container can't trap it. */}
      {releaseNotes && showNotes && createPortal(<WhatsNew onClose={() => setShowNotes(false)} />, document.body)}
    </footer>
  )
}
