import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../lib/auth'
import { errorMessage } from '../lib/api'
import {
  deleteTaskFeedback,
  fetchTaskFeedback,
  fileTaskFeedback,
  reviewTaskFeedback,
  type TaskFeedbackWithPeople,
} from '../lib/taskFeedback'
import { Detail } from '../components/Detail'
import { Modal } from '../components/Modal'
import type { FeedbackStatus } from '../types'
import { contributorPath } from '../lib/urlRef'
import { confirmDialog } from '../lib/dialog'
import { downloadCsv } from '../lib/csv'
import { SearchInput, SegmentedTabs, TableCard, TableToolbar } from '../components/TableToolbar'
import { usePageTitle } from '../lib/usePageTitle'

const MANAGER_ROLES = ['admin', 'lead']

type StatusFilter = FeedbackStatus | 'all'

const STATUS_FILTERS: StatusFilter[] = ['pending', 'valid', 'invalid', 'all']
const STATUS_LABELS: Record<StatusFilter, string> = { pending: 'Pending', valid: 'Valid', invalid: 'Invalid', all: 'All' }
const STATUS_STYLES: Record<FeedbackStatus, string> = {
  pending: 'bg-status-warning-bg text-status-warning-text',
  valid: 'bg-status-success-bg text-status-success-text',
  invalid: 'bg-status-danger-bg text-status-danger-text',
}

const pillClass = 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium'
const inputClass = 'rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent'

export function Feedback() {
  usePageTitle('Feedback')
  const { user } = useAuth()
  const isManager = Boolean(user && MANAGER_ROLES.includes(user.role))
  const isAdmin = user?.role === 'admin'
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending')
  const [search, setSearch] = useState('')
  const [newReport, setNewReport] = useState(false)
  const [viewingId, setViewingId] = useState<number | null>(null)

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ['task-feedback', 'all'],
    queryFn: fetchTaskFeedback,
    refetchInterval: 30_000,
  })

  const term = search.trim().toLowerCase()
  const matchesSearch = (r: TaskFeedbackWithPeople) =>
    !term ||
    r.task_id.toLowerCase().includes(term) ||
    Boolean(r.contributor?.name.toLowerCase().includes(term)) ||
    Boolean(r.contributor?.email.toLowerCase().includes(term))
  const searched = reports.filter(matchesSearch)
  const countOf = (status: StatusFilter) => (status === 'all' ? searched.length : searched.filter((r) => r.status === status).length)
  const rows = searched.filter((r) => statusFilter === 'all' || r.status === statusFilter)
  const columnCount = isManager ? 6 : 5
  // Looked up by id each render, so the modal follows the report if it's checked while open.
  const viewing = viewingId === null ? null : (reports.find((r) => r.id === viewingId) ?? null)

  function exportRows() {
    downloadCsv(
      `feedback-${new Date().toISOString().slice(0, 10)}.csv`,
      rows.map((r) => ({
        'CB Email': r.contributor?.email ?? '',
        'CB Name': r.contributor?.name ?? '',
        'Task ID': r.task_id,
        Feedback: r.screenshot_url,
        Remarks: r.cb_remarks ?? '',
        Status: STATUS_LABELS[r.status],
        'Lead Remarks': r.lead_remarks ?? '',
        'Checked By': r.reviewer?.name ?? '',
        Reported: new Date(r.created_at).toLocaleString(),
      })),
    )
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Feedback</h1>
          <p className="text-sm text-gray-500">
            {isManager
              ? "Feedback your team got on their tasks. Check each one and mark it valid or invalid, with your remarks."
              : 'Report the feedback you got on a task. Your lead checks whether it holds up and adds their remarks.'}
          </p>
        </div>
        <button onClick={() => setNewReport(true)} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground">
          Report feedback
        </button>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SegmentedTabs
          aria-label="Filter by status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={STATUS_FILTERS.map((status) => ({ value: status, label: STATUS_LABELS[status], count: countOf(status) }))}
        />
      </div>

      <TableCard
        toolbar={
          <TableToolbar>
            <SearchInput value={search} onChange={setSearch} placeholder={isManager ? 'Search task ID or contributor...' : 'Search task ID...'} />
            {isManager && (
              <button
                onClick={exportRows}
                disabled={rows.length === 0}
                className="ml-auto h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Export
              </button>
            )}
          </TableToolbar>
        }
      >
        <table className="w-full min-w-[48rem] text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
            <tr>
              {isManager && <th className="px-5 py-3">Contributor</th>}
              <th className="px-5 py-3">Task ID</th>
              <th className="px-5 py-3">CB remarks</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Lead remarks</th>
              <th className="px-5 py-3 text-right">Feedback</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && (
              <tr>
                <td colSpan={columnCount} className="px-5 py-6 text-center text-gray-400">
                  Loading...
                </td>
              </tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={columnCount} className="px-5 py-6 text-center text-gray-400">
                  {statusFilter === 'all' ? 'No feedback reports.' : `No ${STATUS_LABELS[statusFilter].toLowerCase()} feedback reports.`}
                </td>
              </tr>
            )}
            {rows.map((report) => (
              <tr key={report.id} onClick={() => setViewingId(report.id)} className="cursor-pointer align-top hover:bg-gray-50">
                {isManager && (
                  <td className="px-5 py-3">
                    {report.contributor ? (
                      <>
                        <Link
                          to={contributorPath(report.contributor.email)}
                          onClick={(e) => e.stopPropagation()}
                          className="font-medium text-sky-700 hover:underline"
                        >
                          {report.contributor.name}
                        </Link>
                        <div className="text-xs text-gray-400">{report.contributor.email}</div>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                )}
                <td className="px-5 py-3">
                  <span className="font-mono text-xs break-all">{report.task_id}</span>
                  <div className="mt-0.5 text-xs text-gray-400">{new Date(report.created_at).toLocaleDateString()}</div>
                </td>
                <td className="max-w-xs px-5 py-3 text-gray-600">
                  <span className="line-clamp-2">{report.cb_remarks ?? <span className="text-gray-400">—</span>}</span>
                </td>
                <td className="px-5 py-3">
                  <span className={`${pillClass} ${STATUS_STYLES[report.status]}`}>{STATUS_LABELS[report.status]}</span>
                </td>
                <td className="max-w-xs px-5 py-3 text-gray-600">
                  <span className="line-clamp-2">{report.lead_remarks ?? <span className="text-gray-400">—</span>}</span>
                </td>
                <td className="px-5 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <a
                      href={report.screenshot_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-gray-50"
                    >
                      Screenshot
                    </a>
                    <button
                      onClick={() => setViewingId(report.id)}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                    >
                      {report.status === 'pending' && (isAdmin || (isManager && report.user_id !== user?.id)) ? 'Check' : 'Details'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>

      {viewing && (
        <FeedbackDetailsModal
          key={viewing.id}
          report={viewing}
          isManager={isManager}
          // Leads check their contributors' reports, not their own; admins check any.
          canReview={isAdmin || (isManager && viewing.user_id !== user?.id)}
          canDelete={isAdmin || (isManager && viewing.user_id !== user?.id) || (viewing.user_id === user?.id && viewing.status === 'pending')}
          isOwn={viewing.user_id === user?.id}
          onInvalidate={() => queryClient.invalidateQueries({ queryKey: ['task-feedback'] })}
          onClose={() => setViewingId(null)}
        />
      )}

      {newReport && <NewFeedbackModal onClose={() => setNewReport(false)} />}
    </div>
  )
}

function FeedbackDetailsModal({
  report,
  isManager,
  canReview,
  canDelete,
  isOwn,
  onInvalidate,
  onClose,
}: {
  report: TaskFeedbackWithPeople
  isManager: boolean
  canReview: boolean
  canDelete: boolean
  isOwn: boolean
  onInvalidate: () => void
  onClose: () => void
}) {
  const [remarks, setRemarks] = useState(report.lead_remarks ?? '')
  const [screenshotFailed, setScreenshotFailed] = useState(false)

  const reviewMutation = useMutation({
    mutationFn: (status: 'valid' | 'invalid') => reviewTaskFeedback(report.id, status, remarks),
    onSuccess: () => {
      onInvalidate()
      onClose()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteTaskFeedback(report.id),
    onSuccess: () => {
      onInvalidate()
      onClose()
    },
  })

  const busy = reviewMutation.isPending || deleteMutation.isPending
  const withdrawing = isOwn && report.status === 'pending'

  return (
    <Modal title="Feedback report" onClose={onClose} maxWidthClassName="max-w-xl">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className={`${pillClass} ${STATUS_STYLES[report.status]}`}>{STATUS_LABELS[report.status]}</span>
        <span className="ml-auto text-xs text-gray-400">Report #{report.id}</span>
      </div>
      <dl>
        <Detail label="Contributor">
          {report.contributor ? (
            isManager ? (
              <>
                <Link to={contributorPath(report.contributor.email)} className="font-medium text-sky-700 hover:underline">
                  {report.contributor.name}
                </Link>
                <div className="text-xs text-gray-400">{report.contributor.email}</div>
              </>
            ) : (
              report.contributor.name
            )
          ) : (
            '—'
          )}
        </Detail>
        <Detail label="Task ID">
          <span className="font-mono text-xs break-all">{report.task_id}</span>
        </Detail>
        <Detail label="Feedback">
          <a href={report.screenshot_url} target="_blank" rel="noopener noreferrer" className="break-all text-sky-700 hover:underline">
            {report.screenshot_url}
          </a>
          {!screenshotFailed && (
            <a href={report.screenshot_url} target="_blank" rel="noopener noreferrer" className="mt-2 block">
              <img
                src={report.screenshot_url}
                alt="Feedback screenshot"
                loading="lazy"
                onError={() => setScreenshotFailed(true)}
                className="max-h-64 rounded-lg border border-gray-200"
              />
            </a>
          )}
        </Detail>
        <Detail label="CB remarks">
          {report.cb_remarks ? <span className="whitespace-pre-wrap">{report.cb_remarks}</span> : <span className="text-gray-400">No remarks</span>}
        </Detail>
        <Detail label="Reported">{new Date(report.created_at).toLocaleString()}</Detail>
        <Detail label="Checked">
          {report.reviewed_at ? (
            <>
              {STATUS_LABELS[report.status]} on {new Date(report.reviewed_at).toLocaleString()}
              {report.reviewer && <span className="text-gray-500"> by {report.reviewer.name}</span>}
            </>
          ) : (
            <span className="text-gray-400">Waiting for the lead to check</span>
          )}
        </Detail>
        {!canReview && (
          <Detail label="Lead remarks">
            {report.lead_remarks ? <span className="whitespace-pre-wrap">{report.lead_remarks}</span> : <span className="text-gray-400">No remarks</span>}
          </Detail>
        )}
      </dl>

      {canReview && (
        <label className="mt-4 flex flex-col gap-1 text-sm">
          <span className="font-medium text-gray-700">Lead remarks</span>
          <textarea
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            maxLength={2000}
            rows={3}
            placeholder="e.g. Good task - no errors"
            className={inputClass}
          />
        </label>
      )}

      {(reviewMutation.isError || deleteMutation.isError) && (
        <div className="mt-3 text-sm text-status-danger-text">
          {errorMessage(reviewMutation.error ?? deleteMutation.error, 'Could not save this report.')}
        </div>
      )}

      {(canReview || canDelete) && (
        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          {canDelete && (
            <button
              onClick={async () => {
                const ok = withdrawing
                  ? await confirmDialog('Withdraw this feedback report?', { confirmLabel: 'Withdraw' })
                  : await confirmDialog('Delete this feedback report? This cannot be undone.', { confirmLabel: 'Delete', danger: true })
                if (ok) deleteMutation.mutate()
              }}
              disabled={busy}
              className="mr-auto rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              {withdrawing ? 'Withdraw' : 'Delete'}
            </button>
          )}
          {canReview && (
            <>
              <button
                onClick={() => reviewMutation.mutate('invalid')}
                disabled={busy}
                title="The feedback doesn't hold up"
                className="rounded-lg border border-status-danger-text/30 px-3 py-1.5 text-xs font-semibold text-status-danger-text hover:bg-status-danger-bg disabled:opacity-50"
              >
                Mark invalid
              </button>
              <button
                onClick={() => reviewMutation.mutate('valid')}
                disabled={busy}
                title="The feedback is true"
                className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground disabled:opacity-50"
              >
                Mark valid
              </button>
            </>
          )}
        </div>
      )}
    </Modal>
  )
}

function NewFeedbackModal({ onClose }: { onClose: () => void }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [taskId, setTaskId] = useState('')
  const [screenshotUrl, setScreenshotUrl] = useState('')
  const [remarks, setRemarks] = useState('')

  const fileMutation = useMutation({
    mutationFn: () => {
      if (!user) throw new Error('Unauthenticated')
      return fileTaskFeedback({ userId: user.id, taskId, screenshotUrl, remarks })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task-feedback'] })
      onClose()
    },
  })

  return (
    <Modal title="Report feedback" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          fileMutation.mutate()
        }}
        className="flex flex-col gap-3"
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-gray-700">Task ID</span>
          <input
            autoFocus
            required
            value={taskId}
            onChange={(e) => setTaskId(e.target.value)}
            maxLength={100}
            placeholder="e.g. 6aa34905fe8d09b156e1ef4d"
            className={`${inputClass} font-mono`}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-gray-700">Screenshot of the feedback</span>
          <input
            required
            type="url"
            value={screenshotUrl}
            onChange={(e) => setScreenshotUrl(e.target.value)}
            maxLength={1000}
            placeholder="https://snipboard.io/..."
            className={inputClass}
          />
          <span className="text-xs text-gray-400">A link to the screenshot, e.g. from snipboard.io.</span>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-gray-700">Remarks</span>
          <textarea
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            maxLength={2000}
            rows={3}
            placeholder="e.g. Low accuracy percentage but noted as no errors"
            className={inputClass}
          />
        </label>
        {fileMutation.isError && (
          <div className="text-sm text-status-danger-text">{errorMessage(fileMutation.error, 'Could not file this report.')}</div>
        )}
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600">
            Cancel
          </button>
          <button
            type="submit"
            disabled={fileMutation.isPending}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
          >
            {fileMutation.isPending ? 'Sending...' : 'Send to lead'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
