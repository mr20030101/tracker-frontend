import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../lib/auth'
import {
  buildBadVideoRequestFormUrl,
  buildExtensionRequestFormUrl,
  deleteTaskRequestsBulk,
  fetchTaskRequests,
  reviewTaskRequest,
  reviewTaskRequestsBulk,
  deleteTaskRequest,
  type TaskRequestWithContext,
} from '../lib/taskRequests'
import { BadVideoReportModal } from '../components/BadVideoReportModal'
import { Modal } from '../components/Modal'
import type { RequestStatus, RequestType } from '../types'
import { contributorPath } from '../lib/urlRef'
import { RobotEmoji } from '../components/RobotEmoji'

const MANAGER_ROLES = ['admin', 'lead']

type StatusFilter = RequestStatus | 'all'
type TypeFilter = RequestType | 'all'
type Notice = { tone: 'success' | 'error'; text: string }

const STATUS_FILTERS: StatusFilter[] = ['pending', 'approved', 'denied', 'all']
const STATUS_LABELS: Record<StatusFilter, string> = { pending: 'Pending', approved: 'Approved', denied: 'Denied', all: 'All' }
const STATUS_STYLES: Record<RequestStatus, string> = {
  pending: 'bg-status-warning-bg text-status-warning-text',
  approved: 'bg-status-success-bg text-status-success-text',
  denied: 'bg-status-danger-bg text-status-danger-text',
}

const TYPE_FILTERS: TypeFilter[] = ['all', 'extension', 'bad_video']
const TYPE_LABELS: Record<TypeFilter, string> = { all: 'All types', extension: 'Extension', bad_video: 'Bad Video' }
const TYPE_STYLES: Record<RequestType, string> = {
  extension: 'bg-sky-100 text-sky-700',
  bad_video: 'bg-violet-100 text-violet-700',
}

const pillClass = 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium'
const humanize = (value: string) => value.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-3 border-b border-gray-100 py-2.5 last:border-b-0">
      <dt className="pt-0.5 text-xs font-semibold uppercase tracking-wider text-gray-400">{label}</dt>
      <dd className="min-w-0 break-words text-gray-800">{children}</dd>
    </div>
  )
}
const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`

export function Requests() {
  const { user } = useAuth()
  const isManager = Boolean(user && MANAGER_ROLES.includes(user.role))
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [notice, setNotice] = useState<Notice | null>(null)
  const [newReport, setNewReport] = useState(false)
  const [viewingId, setViewingId] = useState<number | null>(null)

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['task-requests', 'all'],
    queryFn: fetchTaskRequests,
    refetchInterval: 30_000,
  })

  const reviewMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: 'approved' | 'denied' }) => {
      if (!user) throw new Error('Unauthenticated')
      return reviewTaskRequest(id, status, user.id)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['task-requests'] }),
  })

  const withdrawMutation = useMutation({
    mutationFn: deleteTaskRequest,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['task-requests'] }),
  })

  const bulkReviewMutation = useMutation({
    mutationFn: ({ ids, status }: { ids: number[]; status: 'approved' | 'denied' }) => {
      if (!user) throw new Error('Unauthenticated')
      return reviewTaskRequestsBulk(ids, status, user.id)
    },
    onSuccess: (result, { ids, status }) => {
      queryClient.invalidateQueries({ queryKey: ['task-requests'] })
      const verb = status === 'approved' ? 'approved' : 'denied'
      if (result.failed.length === 0) {
        setSelectedIds(new Set())
        setNotice({ tone: 'success', text: `${plural(result.updated.length, 'request')} ${verb}.` })
        return
      }
      setSelectedIds(new Set(result.failed.map((f) => f.id)))
      setNotice({
        tone: 'error',
        text: `${result.updated.length} of ${ids.length} ${verb}. Not done: ${result.failed.map((f) => f.error).join('; ')}. They're still selected so you can try again.`,
      })
    },
  })

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: number[]) => deleteTaskRequestsBulk(ids),
    onSuccess: (result, ids) => {
      queryClient.invalidateQueries({ queryKey: ['task-requests'] })
      if (result.failed.length === 0) {
        setSelectedIds(new Set())
        setNotice({ tone: 'success', text: `Deleted ${plural(result.updated.length, 'request')}.` })
        return
      }
      setSelectedIds(new Set(result.failed.map((f) => f.id)))
      setNotice({
        tone: 'error',
        text: `Deleted ${result.updated.length} of ${ids.length}. Not done: ${result.failed.map((f) => f.error).join('; ')}. They're still selected so you can try again.`,
      })
    },
  })

  // Opens the actual Scale "Reclaim / Extend" form, prefilled from this request, then marks it
  // approved here — filing that form is what approving really means.
  function handleRequestExtension(request: TaskRequestWithContext) {
    window.open(
      buildExtensionRequestFormUrl({
        taskId: request.task_submission?.task_id ?? null,
        cbEmail: request.task_submission?.cb_email ?? null,
        remotaskId: request.requester?.remotasks_id ?? null,
        reason: request.reason,
        supportName: user?.name ?? '',
      }),
      '_blank',
      'noopener,noreferrer',
    )
    reviewMutation.mutate({ id: request.id, status: 'approved' })
  }

  // Same mechanism, pointed at the Bad Video Validation/Removal form instead.
  function handleFileBadVideoReport(request: TaskRequestWithContext) {
    if (request.type !== 'bad_video') return
    window.open(
      buildBadVideoRequestFormUrl({
        cbEmail: request.task_submission?.cb_email ?? null,
        taskId: request.task_submission?.task_id ?? null,
        category: request.bad_video_category,
        frame: request.bad_video_frame,
        workforce: request.bad_video_workforce,
        workforceName: request.bad_video_workforce_name,
        supportName: user?.name ?? '',
      }),
      '_blank',
      'noopener,noreferrer',
    )
    reviewMutation.mutate({ id: request.id, status: 'approved' })
  }

  // A contributor can act (withdraw) on a request only if it's their own — either their extension
  // request, or a bad_video report they flagged themselves. A bad_video report someone else (their
  // lead) filed about their work is view-only.
  const canAct = (request: TaskRequestWithContext) => isManager || request.requested_by === user?.id

  // The buttons on a request's row and in its details modal. `after` runs once one is used, so the
  // modal can close; `inModal` drops the reviewed date, which the modal already spells out.
  function actionButtons(request: TaskRequestWithContext, { after, inModal = false }: { after?: () => void; inModal?: boolean } = {}) {
    return (
      <>
        {request.status === 'pending' && canAct(request) && (isManager ? (
          <>
            <button
              onClick={() => {
                if (request.type === 'extension') handleRequestExtension(request)
                else handleFileBadVideoReport(request)
                after?.()
              }}
              disabled={reviewMutation.isPending}
              title={
                request.type === 'extension'
                  ? 'Opens the Reclaim / Extend form, prefilled, and marks this approved'
                  : 'Opens the Bad Video Validation/Removal form, prefilled, and marks this approved'
              }
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground disabled:opacity-50"
            >
              Request
            </button>
            <button
              onClick={() => {
                reviewMutation.mutate({ id: request.id, status: 'denied' })
                after?.()
              }}
              disabled={reviewMutation.isPending}
              className="rounded-lg border border-status-danger-text/30 px-3 py-1.5 text-xs font-semibold text-status-danger-text hover:bg-status-danger-bg disabled:opacity-50"
            >
              Deny
            </button>
          </>
        ) : (
          <button
            onClick={() => {
              withdrawMutation.mutate(request.id)
              after?.()
            }}
            disabled={withdrawMutation.isPending}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            Withdraw
          </button>
        ))}
        {!inModal && request.status !== 'pending' && (
          <span className="text-xs text-gray-400">{request.reviewed_at ? new Date(request.reviewed_at).toLocaleDateString() : ''}</span>
        )}
        {isManager && (
          <button
            onClick={() => {
              if (confirm('Delete this request? This cannot be undone.')) {
                withdrawMutation.mutate(request.id)
                after?.()
              }
            }}
            disabled={withdrawMutation.isPending}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            Delete
          </button>
        )}
      </>
    )
  }

  function setStatus(status: StatusFilter) {
    setStatusFilter(status)
    setSelectedIds(new Set())
  }

  function setType(type: TypeFilter) {
    setTypeFilter(type)
    setSelectedIds(new Set())
  }

  function toggleOne(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAllVisible() {
    setSelectedIds((prev) => (rows.every((r) => prev.has(r.id)) ? new Set() : new Set(rows.map((r) => r.id))))
  }

  const countOf = (status: StatusFilter) => (status === 'all' ? requests.length : requests.filter((r) => r.status === status).length)
  const rows = requests.filter((r) => (statusFilter === 'all' || r.status === statusFilter) && (typeFilter === 'all' || r.type === typeFilter))
  const selected = rows.filter((r) => selectedIds.has(r.id))
  const allVisibleSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.id))
  const columnCount = isManager ? 6 : 5
  // Looked up by id each render, so the modal follows the request if it's reviewed while open.
  const viewing = viewingId === null ? null : (requests.find((r) => r.id === viewingId) ?? null)

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            Requests
            <RobotEmoji page="requests" />
          </h1>
          <p className="text-sm text-gray-500">
            {isManager
              ? "Your team's extension requests and bad-video reports."
              : 'Your extension requests, and any bad-video reports about your work.'}
          </p>
        </div>
        {isManager && (
          <button
            onClick={() => setNewReport(true)}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
          >
            New report
          </button>
        )}
      </div>

      {notice && (
        <div
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className={`mb-4 flex items-start justify-between gap-3 rounded-lg border px-4 py-2.5 text-sm ${
            notice.tone === 'error'
              ? 'border-status-danger-text/30 bg-status-danger-bg text-status-danger-text'
              : 'border-status-success-text/30 bg-status-success-bg text-status-success-text'
          }`}
        >
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} className="opacity-60 hover:opacity-100" aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5" role="tablist" aria-label="Filter by status">
          {STATUS_FILTERS.map((status) => (
            <button
              key={status}
              role="tab"
              aria-selected={statusFilter === status}
              onClick={() => setStatus(status)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                statusFilter === status ? 'bg-accent-bg text-accent-foreground' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {STATUS_LABELS[status]} <span className={statusFilter === status ? 'opacity-70' : 'text-gray-400'}>{countOf(status)}</span>
            </button>
          ))}
        </div>
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5" role="tablist" aria-label="Filter by type">
          {TYPE_FILTERS.map((type) => (
            <button
              key={type}
              role="tab"
              aria-selected={typeFilter === type}
              onClick={() => setType(type)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                typeFilter === type ? 'bg-accent-bg text-accent-foreground' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {TYPE_LABELS[type]}
            </button>
          ))}
        </div>
      </div>

      {selected.length > 0 && (
        <div className="sticky top-0 z-10 mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 shadow-sm">
          <span className="text-sm font-medium text-gray-700">{selected.length} selected</span>
          {statusFilter === 'pending' &&
            (isManager ? (
              <button
                onClick={() => bulkReviewMutation.mutate({ ids: selected.map((r) => r.id), status: 'denied' })}
                disabled={bulkReviewMutation.isPending}
                className="rounded-lg border border-status-danger-text/30 px-3 py-1.5 text-sm font-semibold text-status-danger-text hover:bg-status-danger-bg disabled:opacity-50"
              >
                {bulkReviewMutation.isPending ? 'Denying...' : 'Deny selected'}
              </button>
            ) : (
              <button
                onClick={() => {
                  if (confirm(`Withdraw ${plural(selected.length, 'request')}?`)) {
                    bulkDeleteMutation.mutate(selected.map((r) => r.id))
                  }
                }}
                disabled={bulkDeleteMutation.isPending}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {bulkDeleteMutation.isPending ? 'Withdrawing...' : 'Withdraw selected'}
              </button>
            ))}
          {isManager && (
            <button
              onClick={() => {
                if (confirm(`Delete ${plural(selected.length, 'request')}? This cannot be undone.`)) {
                  bulkDeleteMutation.mutate(selected.map((r) => r.id))
                }
              }}
              disabled={bulkDeleteMutation.isPending}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {bulkDeleteMutation.isPending ? 'Deleting...' : 'Delete selected'}
            </button>
          )}
          <button onClick={() => setSelectedIds(new Set())} className="ml-auto text-sm font-medium text-gray-500 hover:underline">
            Clear selection
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
            <tr>
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  aria-label="Select all on this page"
                  checked={allVisibleSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = selected.length > 0 && !allVisibleSelected
                  }}
                  onChange={toggleAllVisible}
                  className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent"
                />
              </th>
              {isManager && <th className="px-5 py-3">Contributor</th>}
              <th className="px-5 py-3">Type</th>
              <th className="px-5 py-3">Requested</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3 text-right">Actions</th>
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
                  {statusFilter === 'all' ? 'No requests.' : `No ${STATUS_LABELS[statusFilter].toLowerCase()} requests.`}
                </td>
              </tr>
            )}
            {rows.map((request) => (
              <tr key={request.id} onClick={() => setViewingId(request.id)} className="cursor-pointer hover:bg-gray-50">
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    aria-label={`Select request ${request.id}`}
                    checked={selectedIds.has(request.id)}
                    onChange={() => toggleOne(request.id)}
                    className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent"
                  />
                </td>
                {isManager && (
                  <td className="px-5 py-3">
                    {request.requester ? (
                      <Link
                        to={contributorPath(request.requester.email)}
                        onClick={(e) => e.stopPropagation()}
                        className="font-medium text-sky-700 hover:underline"
                      >
                        {request.requester.name}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                )}
                <td className="px-5 py-3">
                  <span className={`${pillClass} ${TYPE_STYLES[request.type]}`}>{TYPE_LABELS[request.type]}</span>
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-gray-500">{new Date(request.requested_at).toLocaleString()}</td>
                <td className="px-5 py-3">
                  <span className={`${pillClass} ${STATUS_STYLES[request.status]}`}>{STATUS_LABELS[request.status]}</span>
                </td>
                <td className="px-5 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => setViewingId(request.id)}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                    >
                      Details
                    </button>
                    {actionButtons(request)}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {viewing && (
        <Modal title="Request details" onClose={() => setViewingId(null)} maxWidthClassName="max-w-xl">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className={`${pillClass} ${TYPE_STYLES[viewing.type]}`}>{TYPE_LABELS[viewing.type]}</span>
            <span className={`${pillClass} ${STATUS_STYLES[viewing.status]}`}>{STATUS_LABELS[viewing.status]}</span>
            <span className="ml-auto text-xs text-gray-400">Request #{viewing.id}</span>
          </div>
          <dl>
            <Detail label="Requested by">
              {viewing.requester ? (
                isManager ? (
                  <>
                    <Link to={contributorPath(viewing.requester.email)} className="font-medium text-sky-700 hover:underline">
                      {viewing.requester.name}
                    </Link>
                    <div className="text-xs text-gray-400">{viewing.requester.email}</div>
                  </>
                ) : (
                  viewing.requester.name
                )
              ) : (
                '—'
              )}
            </Detail>
            <Detail label="Task owner">
              {viewing.task_submission?.cb_email ? (
                isManager ? (
                  <Link to={contributorPath(viewing.task_submission.cb_email)} className="text-sky-700 hover:underline">
                    {viewing.task_submission.cb_email}
                  </Link>
                ) : (
                  viewing.task_submission.cb_email
                )
              ) : (
                '—'
              )}
            </Detail>
            <Detail label="Task ID">
              <span className="font-mono text-xs break-all">{viewing.task_submission?.task_id ?? '—'}</span>
            </Detail>
            <Detail label="Project">{viewing.task_submission?.project?.name ?? '—'}</Detail>
            <Detail label="For date">{viewing.task_submission?.date?.slice(0, 10) ?? '—'}</Detail>
            <Detail label="Task status">{viewing.task_submission ? humanize(viewing.task_submission.status) : '—'}</Detail>
            {viewing.type === 'extension' ? (
              <Detail label="Reason">
                {viewing.reason ? <span className="whitespace-pre-wrap">{viewing.reason}</span> : <span className="text-gray-400">No reason given</span>}
              </Detail>
            ) : (
              <>
                <Detail label="Category">{viewing.bad_video_category}</Detail>
                <Detail label="Frame">{viewing.bad_video_frame}</Detail>
                <Detail label="Workforce">
                  {viewing.bad_video_workforce} — {viewing.bad_video_workforce_name}
                </Detail>
              </>
            )}
            <Detail label="Requested">{new Date(viewing.requested_at).toLocaleString()}</Detail>
            <Detail label="Decision">
              {viewing.reviewed_at ? (
                <>
                  {STATUS_LABELS[viewing.status]} on {new Date(viewing.reviewed_at).toLocaleString()}
                  {viewing.reviewer && <span className="text-gray-500"> by {viewing.reviewer.name}</span>}
                </>
              ) : (
                <span className="text-gray-400">Waiting for a decision</span>
              )}
            </Detail>
          </dl>
          {((viewing.status === 'pending' && canAct(viewing)) || isManager) && (
            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              {actionButtons(viewing, { after: () => setViewingId(null), inModal: true })}
            </div>
          )}
        </Modal>
      )}

      {newReport && <BadVideoReportModal onClose={() => setNewReport(false)} />}
    </div>
  )
}
