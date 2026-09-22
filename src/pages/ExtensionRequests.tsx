import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../lib/auth'
import {
  buildExtensionRequestFormUrl,
  fetchExtensionRequests,
  lookupRemotaskId,
  reviewExtensionRequest,
  withdrawExtensionRequest,
  type ExtensionRequestWithContext,
} from '../lib/extensionRequests'
import type { ExtensionRequestStatus } from '../types'

const MANAGER_ROLES = ['admin', 'lead']

type StatusFilter = ExtensionRequestStatus | 'all'

const STATUS_FILTERS: StatusFilter[] = ['pending', 'approved', 'denied', 'all']
const STATUS_LABELS: Record<StatusFilter, string> = { pending: 'Pending', approved: 'Approved', denied: 'Denied', all: 'All' }
const STATUS_STYLES: Record<ExtensionRequestStatus, string> = {
  pending: 'bg-status-warning-bg text-status-warning-text',
  approved: 'bg-status-success-bg text-status-success-text',
  denied: 'bg-status-danger-bg text-status-danger-text',
}

const pillClass = 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium'

export function ExtensionRequests() {
  const { user } = useAuth()
  const isManager = Boolean(user && MANAGER_ROLES.includes(user.role))
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending')

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['extension-requests-all'],
    queryFn: fetchExtensionRequests,
    refetchInterval: 30_000,
  })

  const reviewMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: 'approved' | 'denied' }) => {
      if (!user) throw new Error('Unauthenticated')
      return reviewExtensionRequest(id, status, user.id)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['extension-requests-all'] }),
  })

  const withdrawMutation = useMutation({
    mutationFn: withdrawExtensionRequest,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['extension-requests-all'] }),
  })

  // Opens the actual Scale "Reclaim / Extend" form, prefilled from this request, then marks it
  // approved here — filing that form is what approving really means.
  async function handleRequest(request: ExtensionRequestWithContext) {
    const remotaskId = request.requester ? await lookupRemotaskId(request.requester.id) : null
    window.open(
      buildExtensionRequestFormUrl({
        taskId: request.task_submission?.task_id ?? null,
        cbEmail: request.task_submission?.cb_email ?? null,
        remotaskId,
        reason: request.reason,
        supportName: user?.name ?? '',
      }),
      '_blank',
      'noopener,noreferrer',
    )
    reviewMutation.mutate({ id: request.id, status: 'approved' })
  }

  const countOf = (status: StatusFilter) => (status === 'all' ? requests.length : requests.filter((r) => r.status === status).length)
  const rows = requests.filter((r) => statusFilter === 'all' || r.status === statusFilter)
  const columnCount = isManager ? 8 : 7

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Extension Requests</h1>
        <p className="text-sm text-gray-500">
          {isManager
            ? "Your team's requests for more time before a submission is marked expired."
            : 'Your requests for more time before a submission is marked expired.'}
        </p>
      </div>

      <div role="tablist" aria-label="Filter by status" className="mb-4 inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
        {STATUS_FILTERS.map((status) => (
          <button
            key={status}
            role="tab"
            aria-selected={statusFilter === status}
            onClick={() => setStatusFilter(status)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              statusFilter === status ? 'bg-accent-bg text-accent-foreground' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {STATUS_LABELS[status]} <span className={statusFilter === status ? 'opacity-70' : 'text-gray-400'}>{countOf(status)}</span>
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
            <tr>
              {isManager && <th className="px-5 py-3">Contributor</th>}
              <th className="px-5 py-3">Task ID</th>
              <th className="px-5 py-3">Project</th>
              <th className="px-5 py-3">For date</th>
              <th className="px-5 py-3">Reason</th>
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
                  {statusFilter === 'all' ? 'No extension requests.' : `No ${STATUS_LABELS[statusFilter].toLowerCase()} requests.`}
                </td>
              </tr>
            )}
            {rows.map((request) => (
              <tr key={request.id} className="hover:bg-gray-50">
                {isManager && (
                  <td className="px-5 py-3">
                    {request.requester ? (
                      <Link
                        to={`/contributors/${encodeURIComponent(request.requester.email)}`}
                        className="font-medium text-sky-700 hover:underline"
                      >
                        {request.requester.name}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                )}
                <td className="max-w-40 truncate px-5 py-3 font-mono text-xs text-gray-600">{request.task_submission?.task_id ?? '—'}</td>
                <td className="px-5 py-3 text-gray-600">{request.task_submission?.project?.name ?? '—'}</td>
                <td className="px-5 py-3 text-gray-500">{request.task_submission?.date?.slice(0, 10) ?? '—'}</td>
                <td className="max-w-64 truncate px-5 py-3 text-gray-600" title={request.reason ?? undefined}>
                  {request.reason ?? <span className="text-gray-300">—</span>}
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-gray-500">{new Date(request.requested_at).toLocaleString()}</td>
                <td className="px-5 py-3">
                  <span className={`${pillClass} ${STATUS_STYLES[request.status]}`}>{STATUS_LABELS[request.status]}</span>
                </td>
                <td className="px-5 py-3 text-right">
                  {request.status !== 'pending' ? (
                    <span className="text-xs text-gray-400">
                      {request.reviewed_at ? new Date(request.reviewed_at).toLocaleDateString() : ''}
                    </span>
                  ) : isManager ? (
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => handleRequest(request)}
                        disabled={reviewMutation.isPending}
                        title="Opens the Reclaim / Extend form, prefilled, and marks this approved"
                        className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground disabled:opacity-50"
                      >
                        Request
                      </button>
                      <button
                        onClick={() => reviewMutation.mutate({ id: request.id, status: 'denied' })}
                        disabled={reviewMutation.isPending}
                        className="rounded-lg border border-status-danger-text/30 px-3 py-1.5 text-xs font-semibold text-status-danger-text hover:bg-status-danger-bg disabled:opacity-50"
                      >
                        Deny
                      </button>
                    </div>
                  ) : (
                    <div className="flex justify-end">
                      <button
                        onClick={() => withdrawMutation.mutate(request.id)}
                        disabled={withdrawMutation.isPending}
                        className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                      >
                        Withdraw
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
