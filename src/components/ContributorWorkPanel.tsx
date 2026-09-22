import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Image } from 'lucide-react'
import { api, supabase } from '../lib/api'
import { useAuth } from '../lib/auth'
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, yearMonth, toISODate, formatRange, formatTime } from '../lib/week'
import { remotasksDiffViewerUrl } from '../lib/remotasks'
import {
  buildBadVideoRequestFormUrl,
  buildExtensionRequestFormUrl,
  requestExtension,
  reviewTaskRequest,
  deleteTaskRequest,
} from '../lib/taskRequests'
import type { ContributorProfile, Project, TaskRequest, TaskSubmission } from '../types'
import { ProgressRing } from './ProgressRing'
import { LineChart } from './LineChart'
import { CountUp } from './CountUp'
import { GrowBar } from './GrowBar'
import { StatusPill } from './StatusPill'
import { ActionsMenu } from './ActionsMenu'
import { SortableHeader } from './SortableHeader'
import { CtsFormModal } from './CtsFormModal'
import { TaskSubmissionForm } from './TaskSubmissionForm'
import { BulkImportModal } from './BulkImportModal'
import { BadVideoReportModal } from './BadVideoReportModal'
import { Modal } from './Modal'

const TREND_DAYS = 30
const MANAGER_ROLES = ['admin', 'lead']
// A request only makes sense before the outcome is settled.
const EXTENSION_ELIGIBLE_STATUSES = ['in_progress', 'expired']

type SortKey = 'task_id' | 'project' | 'stage' | 'status' | 'date'
type ViewMode = 'day' | 'week' | 'month'

interface Props {
  /** Whose work this shows. */
  email: string
  /** Shown in the Bulk Import modal's confirmation text. */
  contributorName: string
  /** Whether Add Submission / Bulk Import / CTS Form / row edits are offered. Off for a restricted ("public") view, where all_submissions comes back empty anyway. */
  canEdit: boolean
}

/**
 * A contributor's own work at a glance: the day/week/month goal ring, submission trend and
 * stage/project breakdown charts (collapsed by default), and a day/week/month table of their
 * submissions with CTS status. Shared by the profile page (for a lead/admin reviewing someone
 * else) and Task Log (for a contributor's own submissions).
 */
export function ContributorWorkPanel({ email, contributorName, canEdit }: Props) {
  const queryClient = useQueryClient()
  const { user: currentUser } = useAuth()
  const isManager = Boolean(currentUser && MANAGER_ROLES.includes(currentUser.role))
  // Collapsed by default; a toggle below shows the goal ring and charts for whoever wants them.
  const [showGraphs, setShowGraphs] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('day')
  const [anchorDate, setAnchorDate] = useState(() => new Date())
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'date', dir: 'desc' })
  const [page, setPage] = useState(1)
  const [showCtsModal, setShowCtsModal] = useState(false)
  const [formTarget, setFormTarget] = useState<'new' | TaskSubmission | null>(null)
  const [bulkImporting, setBulkImporting] = useState(false)
  const [requestingExtensionFor, setRequestingExtensionFor] = useState<TaskSubmission | null>(null)
  const [extensionReason, setExtensionReason] = useState('')
  const [reportingBadVideoFor, setReportingBadVideoFor] = useState<TaskSubmission | null>(null)
  const pageSize = 10

  const thisWeekIso = useMemo(() => toISODate(startOfWeek(new Date())), [])

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['contributor', email, thisWeekIso],
    queryFn: async () =>
      (
        await api.get<ContributorProfile>('/contributor', {
          params: { email, week_start: thisWeekIso },
        })
      ).data,
    enabled: Boolean(email),
  })

  const { data: allProjects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => (await api.get<Project[]>('/projects')).data,
  })

  // Keyed by the joined id list (not the array itself) so this doesn't refetch every time
  // `data` reloads with a same-content-but-new-reference all_submissions array.
  const submissionIds = (data?.all_submissions ?? []).map((s) => s.id)
  const submissionIdsKey = submissionIds.join(',')
  const { data: taskRequests = [] } = useQuery({
    queryKey: ['task-requests', submissionIdsKey],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from('task_requests')
        .select('*')
        .in('task_submission_id', submissionIds)
        .order('requested_at', { ascending: false })
      if (error) throw error
      return rows as TaskRequest[]
    },
    enabled: submissionIds.length > 0,
  })

  function extensionRequestFor(submissionId: number): TaskRequest | undefined {
    return taskRequests.find((request) => request.task_submission_id === submissionId && request.type === 'extension')
  }

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => api.delete(`/task-submissions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contributor'] })
      queryClient.invalidateQueries({ queryKey: ['task-submissions'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] })
    },
  })

  const requestExtensionMutation = useMutation({
    mutationFn: async ({ submissionId, reason }: { submissionId: number; reason: string }) => {
      if (!currentUser) throw new Error('Unauthenticated')
      await requestExtension(submissionId, currentUser.id, reason)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task-requests'] })
      setRequestingExtensionFor(null)
      setExtensionReason('')
    },
  })

  const withdrawRequestMutation = useMutation({
    mutationFn: deleteTaskRequest,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['task-requests'] }),
  })

  const reviewRequestMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: 'approved' | 'denied' }) => {
      if (!currentUser) throw new Error('Unauthenticated')
      return reviewTaskRequest(id, status, currentUser.id)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['task-requests'] }),
  })

  // Opens the actual Scale "Reclaim / Extend" form, prefilled from this request, then marks it
  // approved here — filing that form is what approving really means.
  function handleRequestExtension(request: TaskRequest, submission: TaskSubmission | undefined) {
    window.open(
      buildExtensionRequestFormUrl({
        taskId: submission?.task_id ?? null,
        cbEmail: submission?.cb_email ?? null,
        remotaskId: data?.user?.remotasks_id ?? null,
        reason: request.reason,
        supportName: currentUser?.name ?? '',
      }),
      '_blank',
      'noopener,noreferrer',
    )
    reviewRequestMutation.mutate({ id: request.id, status: 'approved' })
  }

  // Same mechanism, pointed at the Bad Video Validation/Removal form instead.
  function handleFileBadVideoReport(request: TaskRequest, submission: TaskSubmission | undefined) {
    if (request.type !== 'bad_video') return
    window.open(
      buildBadVideoRequestFormUrl({
        cbEmail: submission?.cb_email ?? null,
        taskId: submission?.task_id ?? null,
        category: request.bad_video_category,
        frame: request.bad_video_frame,
        workforce: request.bad_video_workforce,
        workforceName: request.bad_video_workforce_name,
        supportName: currentUser?.name ?? '',
      }),
      '_blank',
      'noopener,noreferrer',
    )
    reviewRequestMutation.mutate({ id: request.id, status: 'approved' })
  }

  const rangeStart = useMemo(() => {
    if (viewMode === 'day') return toISODate(anchorDate)
    if (viewMode === 'week') return toISODate(startOfWeek(anchorDate))
    return toISODate(startOfMonth(anchorDate))
  }, [viewMode, anchorDate])

  const rangeEnd = useMemo(() => {
    if (viewMode === 'day') return toISODate(anchorDate)
    if (viewMode === 'week') return toISODate(endOfWeek(anchorDate))
    return toISODate(endOfMonth(anchorDate))
  }, [viewMode, anchorDate])

  const isCurrentRange = useMemo(() => {
    const today = new Date()
    if (viewMode === 'day') return rangeStart === toISODate(today)
    if (viewMode === 'week') return rangeStart === toISODate(startOfWeek(today))
    const [anchorYear, anchorMonth] = yearMonth(anchorDate)
    const [todayYear, todayMonth] = yearMonth(today)
    return anchorYear === todayYear && anchorMonth === todayMonth
  }, [viewMode, rangeStart, anchorDate])

  function shiftRange(direction: 1 | -1) {
    setAnchorDate((prev) => {
      const next = new Date(prev)
      if (viewMode === 'day') next.setDate(next.getDate() + direction)
      else if (viewMode === 'week') next.setDate(next.getDate() + direction * 7)
      else {
        next.setDate(1)
        next.setMonth(next.getMonth() + direction)
      }
      return next
    })
    setPage(1)
  }

  function rangeLabel(): string {
    if (viewMode === 'day') {
      return new Date(`${rangeStart}T00:00:00`).toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    }
    if (viewMode === 'week') return formatRange(rangeStart, rangeEnd)
    return new Date(`${rangeStart}T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  }

  function toggleSort(key: SortKey) {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
  }

  function sortValue(row: TaskSubmission): string {
    switch (sort.key) {
      case 'task_id':
        return row.task_id ?? ''
      case 'project':
        return row.project?.name ?? ''
      case 'stage':
        return row.stage
      case 'status':
        return row.status
      case 'date':
        return row.date ?? ''
    }
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-status-danger-text bg-status-danger-bg px-5 py-4 text-sm text-status-danger-text">
        Could not load this work: {(error as Error).message}
      </div>
    )
  }

  if (isLoading || !data) {
    return <div className="text-gray-400">Loading...</div>
  }

  const stages = Object.entries(data.stage_breakdown) as [string, number][]
  const maxStageTotal = Math.max(1, ...stages.map(([, total]) => total))
  const maxProjectTotal = Math.max(1, ...data.project_breakdown.map((p) => p.total))

  const trendData =
    data.submission_trend ??
    Array.from({ length: TREND_DAYS }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - (TREND_DAYS - 1 - i))
      const iso = toISODate(d)
      const value = data.all_submissions.filter((r) => r.date?.slice(0, 10) === iso && r.status === 'submitted').length
      return { date: iso, value }
    })

  const visibleSubmissions = data.all_submissions.filter((row) => {
    const d = row.date?.slice(0, 10)
    return d && d >= rangeStart && d <= rangeEnd
  })
  const todaysSubmissions = data.all_submissions.filter(
    (row) => row.date?.slice(0, 10) === toISODate(new Date()) && row.status !== 'in_progress' && !row.cts_submitted_at,
  )

  const sortedSubmissions = [...visibleSubmissions].sort((a, b) => {
    const cmp = sortValue(a).localeCompare(sortValue(b))
    return sort.dir === 'asc' ? cmp : -cmp
  })

  const rangeTarget =
    viewMode === 'day'
      ? Math.round(data.weekly_target / 5)
      : viewMode === 'week'
        ? data.weekly_target
        : data.weekly_target * 4
  const submittedInRange = visibleSubmissions.filter((row) => row.status === 'submitted').length
  const loggedInRange = visibleSubmissions.length
  const rangeProgress = rangeTarget > 0 ? submittedInRange / rangeTarget : 0
  const viewLabel = viewMode === 'day' ? 'Day' : viewMode === 'week' ? 'Week' : 'Month'

  const totalPages = Math.max(1, Math.ceil(sortedSubmissions.length / pageSize))
  const pagedSubmissions = sortedSubmissions.slice((page - 1) * pageSize, page * pageSize)

  // Independent of whichever day/week/month is currently being browsed below, so a pending
  // request for a submission outside that range is never hidden.
  const pendingRequests = taskRequests.filter((request) => request.status === 'pending')

  return (
    <>
      {pendingRequests.length > 0 && (
        <div className="mb-6 rounded-xl border-2 border-status-warning-text bg-status-warning-bg p-5">
          <div className="mb-3 text-sm font-semibold text-status-warning-text">
            {pendingRequests.length === 1 ? '1 request' : `${pendingRequests.length} requests`} awaiting review
          </div>
          <div className="divide-y divide-status-warning-text/20">
            {pendingRequests.map((request) => {
              const submission = data.all_submissions.find((s) => s.id === request.task_submission_id)
              // A contributor can act (withdraw) on a request only if it's their own — either
              // their extension request, or a bad_video report they flagged themselves. A
              // bad_video report someone else (their lead) filed about their work is view-only.
              const canAct = isManager || request.requested_by === currentUser?.id
              return (
                <div key={request.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          request.type === 'extension' ? 'bg-sky-100 text-sky-700' : 'bg-violet-100 text-violet-700'
                        }`}
                      >
                        {request.type === 'extension' ? 'Extension' : 'Bad Video'}
                      </span>
                      <span className="font-mono font-medium text-gray-900">
                        {submission?.task_id ?? `Submission #${request.task_submission_id}`}
                      </span>
                    </div>
                    {request.type === 'extension' ? (
                      request.reason && <div className="mt-0.5 text-xs text-gray-600">{request.reason}</div>
                    ) : (
                      <div className="mt-0.5 text-xs text-gray-600">
                        {request.bad_video_category} · frame {request.bad_video_frame}
                      </div>
                    )}
                    <div className="mt-0.5 text-xs text-gray-400">
                      Requested {new Date(request.requested_at).toLocaleString()}
                      {submission?.date && ` — for ${submission.date.slice(0, 10)}`}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {canAct &&
                      (isManager ? (
                        <>
                          <button
                            onClick={() =>
                              request.type === 'extension'
                                ? handleRequestExtension(request, submission)
                                : handleFileBadVideoReport(request, submission)
                            }
                            disabled={reviewRequestMutation.isPending}
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
                            onClick={() => reviewRequestMutation.mutate({ id: request.id, status: 'denied' })}
                            disabled={reviewRequestMutation.isPending}
                            className="rounded-lg border border-status-danger-text/30 px-3 py-1.5 text-xs font-semibold text-status-danger-text hover:bg-status-danger-bg disabled:opacity-50"
                          >
                            Deny
                          </button>
                          <button
                            onClick={() => {
                              if (confirm('Delete this request? This cannot be undone.')) {
                                withdrawRequestMutation.mutate(request.id)
                              }
                            }}
                            disabled={withdrawRequestMutation.isPending}
                            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                          >
                            Delete
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => withdrawRequestMutation.mutate(request.id)}
                          disabled={withdrawRequestMutation.isPending}
                          className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                        >
                          Withdraw
                        </button>
                      ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setShowGraphs((v) => !v)}
        aria-expanded={showGraphs}
        className="mb-4 inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
      >
        {showGraphs ? 'Hide graphs' : 'Show graphs'}
      </button>

      {showGraphs && (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Day/Week/Month Goal is derived from raw per-row submissions,
                which are deliberately empty in the public view — showing it
                there would just be a permanent, misleading 0. */}
            {!data.is_public_view && (
              <div className="flex items-center gap-5 rounded-xl border border-gray-200 bg-white p-5 lg:col-span-1">
                <ProgressRing value={rangeProgress} label={`${viewLabel} Goal`} sublabel={`${submittedInRange} / ${rangeTarget}`} />
                <div className="flex flex-col gap-3">
                  <div>
                    <div className="text-xs font-medium uppercase tracking-wider text-gray-400">{`Submitted (${viewLabel})`}</div>
                    <div className="text-xl font-bold text-gray-900">
                      <CountUp value={submittedInRange} />
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-medium uppercase tracking-wider text-gray-400">{`Logged (${viewLabel})`}</div>
                    <div className="text-xl font-bold text-gray-900">
                      <CountUp value={loggedInRange} />
                    </div>
                  </div>
                  <div className="text-xs text-gray-400">Minimum goal — submit as much as you want, no upper limit.</div>
                </div>
              </div>
            )}

            <div className={`rounded-xl border border-gray-200 bg-white p-5 ${data.is_public_view ? 'lg:col-span-3' : 'lg:col-span-2'}`}>
              <div className="mb-3 flex items-center justify-between">
                <div className="text-sm font-semibold text-gray-700">Submission Trend</div>
                <span className="text-xs text-gray-400">last {TREND_DAYS} days</span>
              </div>
              <LineChart data={trendData} color="#d4a017" unitLabel="submitted" />
            </div>
          </div>

          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <div className="mb-3 text-sm font-semibold text-gray-700">By Stage (all-time)</div>
              <div className="flex flex-col gap-3">
                {stages.length === 0 && <div className="text-sm text-gray-400">No submissions yet.</div>}
                {stages.map(([stage, total], index) => (
                  <div key={stage} className="flex items-center gap-3 text-sm">
                    <span className="w-16 shrink-0 uppercase text-gray-600">{stage}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                      <GrowBar className="h-full rounded-full bg-accent" pct={Math.max(4, (total / maxStageTotal) * 100)} delay={400 + index * 80} />
                    </div>
                    <span className="w-8 shrink-0 text-right font-medium text-gray-900">{total}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <div className="mb-3 text-sm font-semibold text-gray-700">By Project (all-time)</div>
              <div className="flex flex-col gap-3">
                {data.project_breakdown.length === 0 && <div className="text-sm text-gray-400">No submissions yet.</div>}
                {data.project_breakdown.map((p, index) => (
                  <div key={p.name} className="flex items-center gap-3 text-sm">
                    <span className="w-32 shrink-0 truncate text-gray-600" title={p.name}>
                      {p.name}
                    </span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                      <GrowBar className="h-full rounded-full bg-sky-600" pct={Math.max(4, (p.total / maxProjectTotal) * 100)} delay={400 + index * 80} />
                    </div>
                    <span className="w-8 shrink-0 text-right font-medium text-gray-900">{p.total}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {canEdit && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="flex rounded-lg border border-gray-200 bg-white p-1">
              {(['day', 'week', 'month'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => {
                    setViewMode(mode)
                    setPage(1)
                  }}
                  className={`rounded-md px-3 py-1 text-sm font-medium capitalize ${viewMode === mode ? 'bg-accent text-accent-foreground' : 'text-gray-600'}`}
                >
                  {mode}
                </button>
              ))}
            </div>

            <button
              onClick={() => shiftRange(-1)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              ← Prev
            </button>
            <div className="min-w-48 rounded-lg border border-gray-200 bg-white px-4 py-2 text-center text-sm font-medium text-gray-700">
              {rangeLabel()}
            </div>
            <button
              onClick={() => shiftRange(1)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Next →
            </button>
            {!isCurrentRange && (
              <button
                onClick={() => {
                  setAnchorDate(new Date())
                  setPage(1)
                }}
                className="text-sm font-medium text-sky-700 hover:underline"
              >
                Back to {viewMode === 'day' ? 'today' : viewMode === 'week' ? 'this week' : 'this month'}
              </button>
            )}

            <button
              onClick={() => setShowCtsModal(true)}
              className="ml-auto animate-heartbeat-soft rounded-lg bg-green-500 px-4 py-2 text-sm font-semibold text-white hover:bg-green-600"
            >
              CTS Form
            </button>
            <button
              onClick={() => setBulkImporting(true)}
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50"
            >
              Bulk Import
            </button>
            <button
              onClick={() => setFormTarget('new')}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
            >
              + Add Submission
            </button>
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="border-b border-gray-200 bg-gray-50 px-5 py-3 text-sm font-semibold text-gray-700">
              Submissions — {rangeLabel()}
            </div>
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
                <tr>
                  <SortableHeader label="Task ID" active={sort.key === 'task_id'} dir={sort.dir} onClick={() => toggleSort('task_id')} />
                  <SortableHeader label="Project" active={sort.key === 'project'} dir={sort.dir} onClick={() => toggleSort('project')} />
                  <SortableHeader label="Stage" active={sort.key === 'stage'} dir={sort.dir} onClick={() => toggleSort('stage')} />
                  <SortableHeader label="Status" active={sort.key === 'status'} dir={sort.dir} onClick={() => toggleSort('status')} />
                  <th className="px-5 py-3">CTS</th>
                  <th className="px-5 py-3">Extension</th>
                  <SortableHeader label="Date" active={sort.key === 'date'} dir={sort.dir} onClick={() => toggleSort('date')} />
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pagedSubmissions.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-5 py-6 text-center text-gray-400">
                      No submissions for this {viewMode}.
                    </td>
                  </tr>
                )}
                {pagedSubmissions.map((row) => {
                  const extension = extensionRequestFor(row.id)
                  const canRequestExtension = !isManager && EXTENSION_ELIGIBLE_STATUSES.includes(row.status)
                  const badVideoPending = taskRequests.some(
                    (r) => r.task_submission_id === row.id && r.type === 'bad_video' && r.status === 'pending',
                  )
                  return (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="max-w-40 truncate px-5 py-3 font-mono text-xs text-gray-500">
                      <span className="inline-flex items-center gap-1.5">
                        {row.task_id ? (
                          <a href={remotasksDiffViewerUrl(row.task_id)} target="_blank" rel="noreferrer" className="text-sky-700 hover:underline">
                            {row.task_id}
                          </a>
                        ) : (
                          '—'
                        )}
                        {row.snipboard_url && (
                          <a href={row.snipboard_url} target="_blank" rel="noreferrer" title="View screenshot" className="text-gray-400 hover:text-sky-700">
                            <Image className="h-3.5 w-3.5" strokeWidth={2} />
                          </a>
                        )}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-600">{row.project?.name ?? '—'}</td>
                    <td className="px-5 py-3 uppercase text-gray-600">{row.stage}</td>
                    <td className="px-5 py-3">
                      <StatusPill status={row.status} />
                    </td>
                    <td className="px-5 py-3">
                      {row.cts_submitted_at ? (
                        <span className="inline-flex items-center rounded-full bg-status-success-bg px-2.5 py-0.5 text-xs font-medium text-status-success-text">
                          Sent
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-status-neutral-bg px-2.5 py-0.5 text-xs font-medium text-status-neutral-text">
                          Pending
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {extension ? (
                        <span
                          title={extension.reason ?? undefined}
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            extension.status === 'approved'
                              ? 'bg-status-success-bg text-status-success-text'
                              : extension.status === 'denied'
                                ? 'bg-status-danger-bg text-status-danger-text'
                                : 'bg-status-warning-bg text-status-warning-text'
                          }`}
                        >
                          {extension.status === 'approved' ? 'Approved' : extension.status === 'denied' ? 'Denied' : 'Pending'}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-gray-500">
                      {row.date?.slice(0, 10) ?? '—'}
                      {row.date && <span className="ml-1.5 text-xs text-gray-400">{formatTime(row.created_at)}</span>}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex justify-end">
                        <ActionsMenu
                          items={[
                            { label: 'Edit', onClick: () => setFormTarget(row) },
                            ...(canRequestExtension
                              ? extension?.status === 'pending'
                                ? [{ label: 'Withdraw extension request', onClick: () => withdrawRequestMutation.mutate(extension.id) }]
                                : [
                                    {
                                      label: 'Request extension',
                                      onClick: () => {
                                        setRequestingExtensionFor(row)
                                        setExtensionReason('')
                                      },
                                    },
                                  ]
                              : []),
                            ...(isManager && extension?.status === 'pending'
                              ? [
                                  { label: 'Request extension', onClick: () => handleRequestExtension(extension, row) },
                                  {
                                    label: 'Deny extension',
                                    variant: 'danger' as const,
                                    onClick: () => reviewRequestMutation.mutate({ id: extension.id, status: 'denied' }),
                                  },
                                ]
                              : []),
                            ...(isManager && extension
                              ? [
                                  {
                                    label: 'Delete extension request',
                                    variant: 'danger' as const,
                                    onClick: () => {
                                      if (confirm('Delete this extension request? This cannot be undone.')) {
                                        withdrawRequestMutation.mutate(extension.id)
                                      }
                                    },
                                  },
                                ]
                              : []),
                            badVideoPending
                              ? { label: 'Bad video report pending', disabled: true, onClick: () => {} }
                              : { label: 'Report bad video', onClick: () => setReportingBadVideoFor(row) },
                            {
                              label: 'Delete',
                              variant: 'danger',
                              onClick: () => {
                                if (confirm('Delete this submission?')) {
                                  deleteMutation.mutate(row.id)
                                }
                              },
                            },
                          ]}
                        />
                      </div>
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
            {sortedSubmissions.length > 0 && (
              <div className="flex items-center justify-between border-t border-gray-200 px-5 py-3 text-sm text-gray-500">
                <span>
                  Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, sortedSubmissions.length)} of {sortedSubmissions.length}
                </span>
                <div className="flex gap-2">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                    className="rounded-lg border border-gray-200 px-3 py-1 disabled:opacity-40"
                  >
                    Prev
                  </button>
                  <button
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="rounded-lg border border-gray-200 px-3 py-1 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {showCtsModal && <CtsFormModal email={email} submissions={todaysSubmissions} onClose={() => setShowCtsModal(false)} />}

      {formTarget && (
        <TaskSubmissionForm submission={formTarget === 'new' ? undefined : formTarget} onClose={() => setFormTarget(null)} />
      )}

      {bulkImporting && (
        <BulkImportModal projects={allProjects} contributorEmail={email} contributorName={contributorName} onClose={() => setBulkImporting(false)} />
      )}

      {requestingExtensionFor && (
        <Modal title="Request an extension?" onClose={() => setRequestingExtensionFor(null)}>
          <div className="flex flex-col gap-4">
            <p className="text-sm text-gray-600">
              Asks your lead for more time on{' '}
              <span className="font-mono text-gray-900">{requestingExtensionFor.task_id ?? 'this task'}</span> before it's marked
              expired.
            </p>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Reason (optional)</label>
              <textarea
                rows={3}
                maxLength={500}
                value={extensionReason}
                onChange={(e) => setExtensionReason(e.target.value)}
                placeholder="Why do you need more time?"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </div>
            {requestExtensionMutation.isError && (
              <div className="text-sm text-status-danger-text">
                {requestExtensionMutation.error instanceof Error
                  ? requestExtensionMutation.error.message
                  : 'Could not send this request.'}
              </div>
            )}
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRequestingExtensionFor(null)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={requestExtensionMutation.isPending}
                onClick={() =>
                  requestExtensionMutation.mutate({ submissionId: requestingExtensionFor.id, reason: extensionReason })
                }
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
              >
                {requestExtensionMutation.isPending ? 'Sending...' : 'Send request'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {reportingBadVideoFor && (
        <BadVideoReportModal
          submission={{
            id: reportingBadVideoFor.id,
            task_id: reportingBadVideoFor.task_id,
            cb_email: reportingBadVideoFor.cb_email,
          }}
          onClose={() => setReportingBadVideoFor(null)}
        />
      )}
    </>
  )
}
