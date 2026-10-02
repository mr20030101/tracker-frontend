import { useState } from 'react'
import { createPortal } from 'react-dom'
import changelog from '../../CHANGELOG.md?raw'
import { version } from '../../package.json'
import { boldSegments, parseChangelog } from '../lib/changelog'
import { Modal } from './Modal'

// The footer under every page's content — signed in or not — stating the build's version.
// Clicking the version opens "What's new": CHANGELOG.md, bundled at build time, so the notes
// always match the version that opened them.

// Imported from package.json, the one place it's set (bumped with `npm run release`). An
// import rather than a build-time constant, so a running dev server picks up a new version
// straight away instead of showing the old one until it's restarted. Only `version` is
// bundled, not the rest of package.json.
export const APP_VERSION = version

const RELEASES = parseChangelog(changelog)

function Text({ value }: { value: string }) {
  return boldSegments(value).map((segment, index) =>
    segment.bold ? <strong key={index}>{segment.value}</strong> : <span key={index}>{segment.value}</span>,
  )
}

function WhatsNew({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="What's new" onClose={onClose} maxWidthClassName="max-w-2xl">
      <div className="max-h-[70vh] space-y-6 overflow-y-auto pr-1 text-sm">
        {RELEASES.length === 0 && <p className="text-gray-600">No release notes yet.</p>}

        {RELEASES.map((release) => (
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

export function AppFooter({ className = '' }: { className?: string }) {
  const [showNotes, setShowNotes] = useState(false)

  return (
    <footer className={`flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-gray-400 ${className}`}>
      <span>&copy; {new Date().getFullYear()} Grey Owls Tracker</span>
      <span aria-hidden="true">&bull;</span>
      <button
        type="button"
        onClick={() => setShowNotes(true)}
        title="What's new"
        className="tabular-nums hover:text-gray-700 hover:underline"
      >
        v{APP_VERSION}
      </button>
      {/* Portaled, so a footer inside a transformed or clipped container can't trap it. */}
      {showNotes && createPortal(<WhatsNew onClose={() => setShowNotes(false)} />, document.body)}
    </footer>
  )
}
