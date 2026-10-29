import { useState } from 'react'
import { ChevronDown, Download, Puzzle } from 'lucide-react'
import manifest from '../../extension/manifest.json'

// The browser extension's zip, served from public/downloads by `npm run pack:extension`
// (scripts/pack-extension.mjs), which also keeps it in step with extension/manifest.json's version.
const DOWNLOAD_URL = '/downloads/grey-owls-tracker-extension.zip'

const INSTALL_STEPS = [
  'Unzip the file into a folder you’ll keep, such as Documents. Don’t delete it afterwards: the browser runs it from there.',
  'Open brave://extensions (or chrome://extensions, edge://extensions) and turn on Developer mode, top right.',
  'Click Load unpacked and choose the unzipped grey-owls-tracker folder.',
  'Pin it from the puzzle-piece icon in the toolbar, sign in with your tracker account, and pick your project and stage.',
]

const USAGE_STEPS = [
  'Pick your project and stage, paste a task ID (or task link) and press Start. It’s logged as In Progress with its timer running.',
  'Paste your screenshot link (Snipboard, Lightshot, etc.) on the task card and press Save. It’s the same Screenshot link as on Add Submission.',
  'Press Submitted when you’re done. It stops the timer and saves the screenshot link too, if you haven’t pressed Save.',
  'Pause and Resume stop and restart the timer. Reset clears a wrong task ID, and Reload brings everything up to date from the tracker.',
  'On the Requests tab, send your lead an extension or reclaim request with a reason, during their shift.',
]

/** Download and install steps for the Grey Owls Tracker browser extension (extension/). */
export function BrowserExtensionCard() {
  const [showSteps, setShowSteps] = useState(false)
  const [showUsage, setShowUsage] = useState(false)

  return (
    <section className="mb-6 overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center gap-4 px-5 py-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-bg text-accent-foreground">
          <Puzzle className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-gray-900">
            Browser extension <span className="ml-1 text-xs font-medium text-gray-400">v{manifest.version}</span>
          </h2>
          <p className="text-sm text-gray-500">
            Time your tasks and send extension or reclaim requests from your browser. Alarms at 30 minutes, 1 hour and 10 minutes
            before a task expires. For Brave, Chrome and Edge.
          </p>
        </div>
        <a
          href={DOWNLOAD_URL}
          download
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
        >
          <Download className="h-4 w-4" aria-hidden />
          Download
        </a>
      </div>

      <button
        type="button"
        onClick={() => setShowSteps((v) => !v)}
        aria-expanded={showSteps}
        className="flex w-full items-center justify-between border-t border-gray-100 px-5 py-2.5 text-left text-sm font-medium text-sky-700 hover:bg-gray-50"
      >
        How to install
        <ChevronDown className={`h-4 w-4 transition-transform ${showSteps ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {showSteps && (
        <ol className="list-decimal space-y-1.5 border-t border-gray-100 px-5 py-4 pl-10 text-sm text-gray-600">
          {INSTALL_STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
          <li className="list-none text-gray-500">
            To update, download the new version, unzip it over the old folder, and press the reload button on the extension’s card.
          </li>
        </ol>
      )}

      <button
        type="button"
        onClick={() => setShowUsage((v) => !v)}
        aria-expanded={showUsage}
        className="flex w-full items-center justify-between border-t border-gray-100 px-5 py-2.5 text-left text-sm font-medium text-sky-700 hover:bg-gray-50"
      >
        How to use
        <ChevronDown className={`h-4 w-4 transition-transform ${showUsage ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {showUsage && (
        <ol className="list-decimal space-y-1.5 border-t border-gray-100 px-5 py-4 pl-10 text-sm text-gray-600">
          {USAGE_STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      )}
    </section>
  )
}
