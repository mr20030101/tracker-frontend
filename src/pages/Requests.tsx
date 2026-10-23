import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Ban, ExternalLink, Eye, Filter, Pencil, Plus, RotateCcw, RotateCw, Trash2, Undo2, X } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../lib/auth'
import { errorMessage } from '../lib/api'
import {
  buildBadVideoRequestFormUrl,
  deleteTaskRequestsBulk,
  editTaskRequest,
  fetchTaskRequests,
  reopenTaskRequest,
  requestExtension,
  reviewTaskRequest,
  reviewTaskRequestsBulk,
  deleteTaskRequest,
  type TaskRequestWithContext,
  OVERDUE_HOURS,
  isOverdue,
  waitingFor,
  fetchRequestShift,
  inShift,
  shiftLabel,
} from '../lib/taskRequests'
import { attendanceTimeLabel } from '../lib/attendanceWindow'
import { BadVideoReportModal } from '../components/BadVideoReportModal'
import { Detail } from '../components/Detail'
import { Modal } from '../components/Modal'
import { FileTimeRequestModal, type TimeRequestFormFields } from '../components/FileTimeRequestModal'
import { TimeRequestReasonModal, type TimeRequestMode } from '../components/TimeRequestReasonModal'
import type { RequestStatus, RequestType } from '../types'
import { contributorPath } from '../lib/urlRef'
import { useNow } from '../lib/useNow'
import { confirmDialog } from '../lib/dialog'
import { SegmentedTabs, TableCard } from '../components/TableToolbar'
import { usePageTitle } from '../lib/usePageTitle'

const MANAGER_ROLES = ['admin', 'lead']

type StatusFilter = RequestStatus | 'all'
type TypeFilter = RequestType | 'all'
type Notice = { tone: 'success' | 'error'; text: string }
type TimeRequest = Extract<TaskRequestWithContext, { type: 'extension' | 'reclaim' }>

const STATUS_FILTERS: StatusFilter[] = ['pending', 'approved', 'denied', 'all']
const STATUS_LABELS: Record<StatusFilter, string> = { pending: 'Pending', approved: 'Approved', denied: 'Denied', all: 'All' }
const STATUS_STYLES: Record<RequestStatus, string> = {
  pending: 'bg-status-warning-bg text-status-warning-text',
  approved: 'bg-status-success-bg text-status-success-text',
  denied: 'bg-status-danger-bg text-status-danger-text',
}

const TYPE_FILTERS: TypeFilter[] = ['all', 'extension', 'reclaim', 'bad_video']
const TYPE_LABELS: Record<TypeFilter, string> = { all: 'All types', extension: 'Extension', reclaim: 'Reclaim', bad_video: 'Bad Video' }
const TYPE_STYLES: Record<RequestType, string> = {
  extension: 'bg-sky-100 text-sky-700',
  reclaim: 'bg-amber-100 text-amber-700',
  bad_video: 'bg-violet-100 text-violet-700',
}

const pillClass = 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium'
const humanize = (value: string) => value.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`

export function Requests() {
  usePageTitle('Requests')
  const { user } = useAuth()
  const isManager = Boolean(user && MANAGER_ROLES.includes(user.role))
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [notice, setNotice] = useState<Notice | null>(null)
  const [newReport, setNewReport] = useState(false)
  const [viewingId, setViewingId] = useState<number | null>(null)
  // The extension/reclaim a lead is checking before filing it with Scale.
  const [filingRequest, setFilingRequest] = useState<{ request: TaskRequestWithContext; fields: TimeRequestFormFields } | null>(null)
  // The requester's own extension/reclaim they're editing (pending) or resending (denied).
  const [revisingRequest, setRevisingRequest] = useState<{ request: TimeRequest; mode: Extract<TimeRequestMode, 'edit' | 'resend'> } | null>(null)

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['task-requests', 'all'],
    queryFn: fetchTaskRequests,
    refetchInterval: 30_000,
  })
  // A contributor can only send a request during their lead's shift (the database checks it too).
  const { data: requestShift = null } = useQuery({ queryKey: ['request-shift'], queryFn: fetchRequestShift, enabled: !isManager })

  const reviewMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: 'approved' | 'denied' }) => {
      if (!user) throw new Error('Unauthenticated')
      return reviewTaskRequest(id, status, user.id)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['task-requests'] }),
  })

  const reviseMutation = useMutation({
    mutationFn: async ({ request, mode, reason }: { request: TimeRequest; mode: 'edit' | 'resend'; reason: string }) => {
      if (!user) throw new Error('Unauthenticated')
      if (mode === 'edit') return editTaskRequest(request.id, reason)
      // A resend is a new request: the denied one stays as it was.
      return requestExtension(request.task_submission_id, user.id, reason, request.type, user.remotasks_id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task-requests'] })
      setRevisingRequest(null)
    },
  })

  const reopenMutation = useMutation({
    mutationFn: reopenTaskRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task-requests'] })
      setNotice({ tone: 'success', text: 'Moved back to pending.' })
    },
    onError: (error) => setNotice({ tone: 'error', text: errorMessage(error, 'Could not move this back to pending.') }),
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

  // Shows the details for the Scale "Reclaim / Extend" form, prefilled from this request (as Extend
  // or Reclaim to match its type), for the lead to check before opening the form. Opening it marks
  // the request approved: filing that form is what approving really means.
  function handleRequestExtension(request: TaskRequestWithContext) {
    setFilingRequest({
      request,
      fields: {
        requestType: request.type === 'reclaim' ? 'Reclaim' : 'Extend',
        taskId: request.task_submission?.task_id ?? null,
        cbEmail: request.task_submission?.cb_email ?? null,
        // The ID given on the request, else (older requests) the one on their profile.
        remotaskId: (request.type !== 'bad_video' ? request.remotasks_id : null) ?? request.requester?.remotasks_id ?? null,
        stage: request.task_submission?.stage ?? null,
        projectName: request.task_submission?.project?.name ?? null,
        reason: request.reason,
      },
    })
  }

  // Same mechanism, pointed at the Bad Video Validation/Removal form instead.
  function handleFileBadVideoReport(request: TaskRequestWithContext) {
    if (request.type !== 'bad_video') return
    window.open(
      buildBadVideoRequestFormUrl({
        cbEmail: request.task_submission?.cb_email ?? null,
        taskId: request.task_submission?.task_id ?? null,
        projectName: request.task_submission?.project?.name ?? null,
        category: request.bad_video_category,
        frame: request.bad_video_frame,
      }),
      '_blank',
      'noopener,noreferrer',
    )
    reviewMutation.mutate({ id: request.id, status: 'approved' })
  }

  // A contributor can act (withdraw) on a request only if it's their own — either their extension
  // or reclaim request, or a bad_video report they flagged themselves. A bad_video report someone else (their
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
                if (request.type === 'bad_video') handleFileBadVideoReport(request)
                else handleRequestExtension(request)
                after?.()
              }}
              disabled={reviewMutation.isPending}
              title={
                request.type === 'bad_video'
                  ? 'Opens the Bad Video Validation/Removal form, prefilled, and marks this approved'
                  : 'Check the details, then open the Reclaim / Extend form and mark this approved'
              }
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground disabled:opacity-50"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              Request
            </button>
            <button
              onClick={() => {
                reviewMutation.mutate({ id: request.id, status: 'denied' })
                after?.()
              }}
              disabled={reviewMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-status-danger-text/30 px-3 py-1.5 text-xs font-semibold text-status-danger-text hover:bg-status-danger-bg disabled:opacity-50"
            >
              <Ban className="h-3.5 w-3.5" aria-hidden />
              Deny
            </button>
          </>
        ) : (
          <>
            {request.type !== 'bad_video' && (
              <button
                onClick={() => {
                  setRevisingRequest({ request, mode: 'edit' })
                  after?.()
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden />
                Edit
              </button>
            )}
            <button
              onClick={() => {
                withdrawMutation.mutate(request.id)
                after?.()
              }}
              disabled={withdrawMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              <Undo2 className="h-3.5 w-3.5" aria-hidden />
              Withdraw
            </button>
          </>
        ))}
        {/* A denied extension/reclaim can be sent again, unless a newer one for that task is already waiting. */}
        {request.status === 'denied' &&
          request.type !== 'bad_video' &&
          request.requested_by === user?.id &&
          !requests.some((r) => r.task_submission_id === request.task_submission_id && r.type === request.type && r.status === 'pending') && (
            <button
              onClick={() => {
                setRevisingRequest({ request, mode: 'resend' })
                after?.()
              }}
              disabled={outsideShift}
              title={outsideShiftHint}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground disabled:opacity-50"
            >
              <RotateCw className="h-3.5 w-3.5" aria-hidden />
              Resend
            </button>
          )}
        {/* For an accidental click: puts it back to pending. A Scale form that was already filed stays filed. */}
        {isManager && request.status !== 'pending' && (
          <button
            onClick={async () => {
              const message =
                request.status === 'approved'
                  ? "Unapprove this request? It goes back to pending. If the Scale form was already submitted, that isn't undone."
                  : 'Undo the denial? It goes back to pending.'
              if (await confirmDialog(message, { confirmLabel: request.status === 'approved' ? 'Unapprove' : 'Undo deny' })) {
                reopenMutation.mutate(request.id)
                after?.()
              }
            }}
            disabled={reopenMutation.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            {request.status === 'approved' ? 'Unapprove' : 'Undo deny'}
          </button>
        )}
        {!inModal && request.status !== 'pending' && (
          <span className="text-xs text-gray-400">{request.reviewed_at ? new Date(request.reviewed_at).toLocaleDateString() : ''}</span>
        )}
        {isManager && (
          <button
            onClick={async () => {
              if (await confirmDialog('Delete this request? This cannot be undone.', { confirmLabel: 'Delete', danger: true })) {
                withdrawMutation.mutate(request.id)
                after?.()
              }
            }}
            disabled={withdrawMutation.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
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
  // Re-read every minute, so a request crosses into Overdue without a reload.
  const now = useNow(60_000)
  const overdueCount = requests.filter((r) => isOverdue(r, now)).length
  const outsideShift = !isManager && requestShift !== null && !inShift(requestShift, now)
  const outsideShiftHint = outsideShift ? `Extension and reclaim requests open during ${requestShift.leadName}'s shift, ${shiftLabel(requestShift)}.` : undefined
  const rows = requests.filter((r) => (statusFilter === 'all' || r.status === statusFilter) && (typeFilter === 'all' || r.type === typeFilter))
  const selected = rows.filter((r) => selectedIds.has(r.id))
  const allVisibleSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.id))
  const columnCount = isManager ? 6 : 5
  // Looked up by id each render, so the modal follows the request if it's reviewed while open.
  const viewing = viewingId === null ? null : (requests.find((r) => r.id === viewingId) ?? null)

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            Requests
          </h1>
          <p className="text-sm text-gray-500">
            {isManager
              ? "Your team's extension and reclaim requests and bad-video reports."
              : 'Your extension and reclaim requests, and any bad-video reports about your work.'}
          </p>
        </div>
        {isManager && (
          <button
            onClick={() => setNewReport(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
          >
            <Plus className="h-4 w-4" aria-hidden />
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
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}

      {requestShift && (
        <p className={`mb-4 rounded-lg border px-4 py-2.5 text-sm ${outsideShift ? 'border-status-warning-text/30 bg-status-warning-bg text-status-warning-text' : 'border-gray-200 text-gray-600'}`}>
          {outsideShift
            ? `${requestShift.leadName} is off shift, so extension and reclaim requests can't be sent right now (bad-video reports still can). They open again at ${attendanceTimeLabel(requestShift.startsMin)}.`
            : `You can send extension and reclaim requests during ${requestShift.leadName}'s shift, ${shiftLabel(requestShift)}.`}
        </p>
      )}

      {isManager && overdueCount > 0 && (
        <div
          role="alert"
          className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-status-danger-text/30 bg-status-danger-bg px-4 py-2.5 text-sm text-status-danger-text"
        >
          <span>
            <strong>
              {overdueCount} request{overdueCount === 1 ? ' has' : 's have'} been waiting over {OVERDUE_HOURS} hours.
            </strong>{' '}
            They're marked Overdue below.
          </span>
          {statusFilter !== 'pending' && (
            <button onClick={() => setStatusFilter('pending')} className="inline-flex items-center gap-1.5 font-semibold underline">
              <Filter className="h-4 w-4" aria-hidden />
              Show pending
            </button>
          )}
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SegmentedTabs
          aria-label="Filter by status"
          value={statusFilter}
          onChange={setStatus}
          options={STATUS_FILTERS.map((status) => ({ value: status, label: STATUS_LABELS[status], count: countOf(status) }))}
        />
        <SegmentedTabs
          aria-label="Filter by type"
          value={typeFilter}
          onChange={setType}
          options={TYPE_FILTERS.map((type) => ({ value: type, label: TYPE_LABELS[type] }))}
        />
      </div>

      {selected.length > 0 && (
        <div className="sticky top-0 z-10 mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 shadow-sm">
          <span className="text-sm font-medium text-gray-700">{selected.length} selected</span>
          {statusFilter === 'pending' &&
            (isManager ? (
              <button
                onClick={() => bulkReviewMutation.mutate({ ids: selected.map((r) => r.id), status: 'denied' })}
                disabled={bulkReviewMutation.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg border border-status-danger-text/30 px-3 py-1.5 text-sm font-semibold text-status-danger-text hover:bg-status-danger-bg disabled:opacity-50"
              >
                <Ban className="h-4 w-4" aria-hidden />
                {bulkReviewMutation.isPending ? 'Denying...' : 'Deny selected'}
              </button>
            ) : (
              <button
                onClick={async () => {
                  if (await confirmDialog(`Withdraw ${plural(selected.length, 'request')}?`, { confirmLabel: 'Withdraw' })) {
                    bulkDeleteMutation.mutate(selected.map((r) => r.id))
                  }
                }}
                disabled={bulkDeleteMutation.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                <Undo2 className="h-4 w-4" aria-hidden />
                {bulkDeleteMutation.isPending ? 'Withdrawing...' : 'Withdraw selected'}
              </button>
            ))}
          {isManager && (
            <button
              onClick={async () => {
                if (await confirmDialog(`Delete ${plural(selected.length, 'request')}? This cannot be undone.`, { confirmLabel: 'Delete', danger: true })) {
                  bulkDeleteMutation.mutate(selected.map((r) => r.id))
                }
              }}
              disabled={bulkDeleteMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              {bulkDeleteMutation.isPending ? 'Deleting...' : 'Delete selected'}
            </button>
          )}
          <button onClick={() => setSelectedIds(new Set())} className="ml-auto inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:underline">
            <X className="h-4 w-4" aria-hidden />
            Clear selection
          </button>
        </div>
      )}

      <TableCard>
        <table className="w-full min-w-[36rem] text-left text-sm">
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
                <td className="px-5 py-3 text-gray-500">
                  {new Date(request.requested_at).toLocaleString()}
                  {request.status === 'pending' && (
                    <div className={`mt-0.5 text-xs ${isOverdue(request, now) ? 'font-semibold text-status-danger-text' : 'text-gray-400'}`}>
                      {isOverdue(request, now) ? 'Overdue · ' : ''}waiting {waitingFor(request.requested_at, now)}
                    </div>
                  )}
                </td>
                <td className="px-5 py-3">
                  <span className={`${pillClass} ${STATUS_STYLES[request.status]}`}>{STATUS_LABELS[request.status]}</span>
                </td>
                <td className="px-5 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      onClick={() => setViewingId(request.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
                    >
                      <Eye className="h-3.5 w-3.5" aria-hidden />
                      Details
                    </button>
                    {actionButtons(request)}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>

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
            {viewing.type !== 'bad_video' && (
              <Detail label="Remotask ID">
                <span className="font-mono text-xs break-all">{viewing.remotasks_id ?? viewing.requester?.remotasks_id ?? '—'}</span>
              </Detail>
            )}
            <Detail label="Task ID">
              <span className="font-mono text-xs break-all">{viewing.task_submission?.task_id ?? '—'}</span>
            </Detail>
            <Detail label="Project">{viewing.task_submission?.project?.name ?? '—'}</Detail>
            <Detail label="For date">{viewing.task_submission?.date?.slice(0, 10) ?? '—'}</Detail>
            <Detail label="Task status">{viewing.task_submission ? humanize(viewing.task_submission.status) : '—'}</Detail>
            {viewing.type !== 'bad_video' ? (
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

      {filingRequest && (
        <FileTimeRequestModal
          initial={filingRequest.fields}
          onFiled={() => reviewMutation.mutate({ id: filingRequest.request.id, status: 'approved' })}
          onClose={() => setFilingRequest(null)}
        />
      )}

      {revisingRequest && (
        <TimeRequestReasonModal
          type={revisingRequest.request.type}
          taskId={revisingRequest.request.task_submission?.task_id ?? null}
          mode={revisingRequest.mode}
          initialReason={revisingRequest.request.reason ?? ''}
          isPending={reviseMutation.isPending}
          error={reviseMutation.error}
          onSubmit={(reason) => reviseMutation.mutate({ ...revisingRequest, reason })}
          onClose={() => {
            setRevisingRequest(null)
            reviseMutation.reset()
          }}
        />
      )}
    </div>
  )
}

