import { useState } from 'react'
import { Link } from 'react-router-dom'
import { remotasksDiffViewerUrl } from '../lib/remotasks'
import { contributorPath } from '../lib/urlRef'
import type { TaskSubmission } from '../types'
import { Detail } from './Detail'
import { Modal } from './Modal'
import { StatusPill } from './StatusPill'

const formatDateTime = (iso: string) => new Date(iso).toLocaleString()

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard
          ?.writeText(text)
          .then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          })
          .catch(() => {})
      }}
      className="shrink-0 rounded-md border border-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

// Everything about one task submission, including the parts the table has no room for: the whole
// Task ID, the notes, the screenshot link, and when it was logged, submitted and sent to CTS.
export function SubmissionDetailsModal({
  submission,
  onClose,
  onEdit,
  onDelete,
}: {
  submission: TaskSubmission
  onClose: () => void
  onEdit?: () => void
  onDelete?: () => void
}) {
  const s = submission
  return (
    <Modal title="Submission details" onClose={onClose} maxWidthClassName="max-w-xl">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <StatusPill status={s.status} />
        <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium uppercase text-gray-600">{s.stage}</span>
        <span className="ml-auto text-xs text-gray-400">Submission #{s.id}</span>
      </div>
      <dl>
        <Detail label="CB email">
          <Link to={contributorPath(s.cb_email)} className="text-sky-700 hover:underline">
            {s.cb_email}
          </Link>
        </Detail>
        <Detail label="Task ID">
          {s.task_id ? (
            <div className="flex items-start gap-2">
              <span className="min-w-0 flex-1 break-all font-mono text-xs">{s.task_id}</span>
              <a
                href={remotasksDiffViewerUrl(s.task_id)}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 text-xs font-medium text-sky-700 hover:underline"
              >
                Open ↗
              </a>
              <CopyButton text={s.task_id} />
            </div>
          ) : (
            '—'
          )}
        </Detail>
        <Detail label="Project">{s.project?.name ?? '—'}</Detail>
        <Detail label="Date">{s.date?.slice(0, 10) ?? '—'}</Detail>
        <Detail label="Logged">{formatDateTime(s.created_at)}</Detail>
        <Detail label="Submitted">{s.submitted_at ? s.submitted_at.slice(0, 10) : <span className="text-gray-400">Not yet</span>}</Detail>
        <Detail label="CTS">
          {s.cts_submitted_at ? formatDateTime(s.cts_submitted_at) : <span className="text-gray-400">Not submitted to CTS</span>}
        </Detail>
        <Detail label="Screenshot">
          {s.snipboard_url ? (
            <a href={s.snipboard_url} target="_blank" rel="noreferrer" className="break-all text-sky-700 hover:underline">
              {s.snipboard_url} ↗
            </a>
          ) : (
            <span className="text-gray-400">None</span>
          )}
        </Detail>
        <Detail label="Notes">
          {s.notes ? <span className="whitespace-pre-wrap">{s.notes}</span> : <span className="text-gray-400">No notes</span>}
        </Detail>
        {s.updated_at && <Detail label="Last updated">{formatDateTime(s.updated_at)}</Detail>}
      </dl>
      {(onEdit || onDelete) && (
        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          {onDelete && (
            <button
              onClick={onDelete}
              className="rounded-lg border border-status-danger-text/30 px-3 py-1.5 text-sm font-semibold text-status-danger-text hover:bg-status-danger-bg"
            >
              Delete
            </button>
          )}
          {onEdit && (
            <button onClick={onEdit} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-foreground">
              Edit
            </button>
          )}
        </div>
      )}
    </Modal>
  )
}
