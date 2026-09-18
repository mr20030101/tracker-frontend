import { useState } from 'react'
import type { TaskSubmission } from '../types'
import { Modal } from './Modal'
import { StatusPill } from './StatusPill'

const CTS_FORM_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLSfXDNf6MntiYIlJHWBlEz2uKFe7I5aNzcPQHm007bUs2qBe9w/viewform'

function buildCtsFormUrl(email: string, taskIds: string[], snipboardUrls: string[]) {
  const params = new URLSearchParams()
  if (email) params.set('entry.544080514', email)
  if (taskIds.length) params.set('entry.1598956863', taskIds.join(','))
  if (snipboardUrls.length) params.set('entry.354206748', snipboardUrls.join(','))
  return `${CTS_FORM_URL}?${params.toString()}`
}

interface Props {
  email: string
  submissions: TaskSubmission[]
  onClose: () => void
}

export function CtsFormModal({ email, submissions, onClose }: Props) {
  const [selected, setSelected] = useState<Set<number>>(new Set(submissions.map((s) => s.id)))

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === submissions.length ? new Set() : new Set(submissions.map((s) => s.id))))
  }

  function handleContinue() {
    const chosen = submissions.filter((s) => selected.has(s.id))
    const taskIds = chosen.map((s) => s.task_id ?? '')
    const snipboardUrls = chosen.map((s) => s.snipboard_url ?? '')
    window.open(buildCtsFormUrl(email, taskIds, snipboardUrls), '_blank', 'noopener,noreferrer')
    onClose()
  }

  return (
    <Modal title="Today's Tasks" onClose={onClose} maxWidthClassName="max-w-4xl">
      <p className="mb-3 text-sm text-gray-500">
        Select the tasks to include, then continue to the CTS Form. Their Task IDs and Snipboard.io links will be
        prefilled for you.
      </p>

      {submissions.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-400">
          No submissions logged today yet.
        </div>
      ) : (
        <div className="max-h-96 overflow-auto rounded-lg border border-gray-200">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
              <tr>
                <th className="w-10 px-4 py-2">
                  <input
                    type="checkbox"
                    checked={selected.size === submissions.length}
                    onChange={toggleAll}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                </th>
                <th className="px-3 py-2">Task ID</th>
                <th className="px-3 py-2">Project</th>
                <th className="px-3 py-2">Stage</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Snipboard.io</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {submissions.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(row.id)}
                      onChange={() => toggle(row.id)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                  </td>
                  <td className="max-w-32 truncate px-3 py-2 font-mono text-xs text-gray-600">{row.task_id ?? '—'}</td>
                  <td className="px-3 py-2 text-gray-600">{row.project?.name ?? '—'}</td>
                  <td className="px-3 py-2 uppercase text-gray-600">{row.stage}</td>
                  <td className="px-3 py-2">
                    <StatusPill status={row.status} />
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {row.snipboard_url ? (
                      <span className="text-status-success-text">Attached</span>
                    ) : (
                      <span className="text-gray-400">Missing</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between">
        <span className="text-xs text-gray-400">{selected.size} of {submissions.length} selected</span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleContinue}
            disabled={selected.size === 0}
            className="rounded-lg bg-green-500 px-4 py-2 text-sm font-semibold text-white hover:bg-green-600 disabled:opacity-50"
          >
            Continue to CTS Form
          </button>
        </div>
      </div>
    </Modal>
  )
}
