import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { Check, Copy, ExternalLink } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import {
  applicationLink,
  describeIssues,
  fetchApplications,
  MIN_GPU_MEMORY_GB,
  requirementIssues,
  reviewApplication,
  safeExternalHref,
  setAcceptingApplications,
  type ReviewResult,
} from '../lib/hiring'
import type { HiringApplication, HiringStatus, User } from '../types'
import { DataTable } from '../components/DataTable'
import { Modal } from '../components/Modal'
import { Select } from '../components/Select'

type StatusFilter = HiringStatus | 'all'
type Notice = { tone: 'success' | 'error'; text: string }
type Review = { application: HiringApplication; decision: 'accept' | 'deny' }
type Credentials = { name: string; email: string; password: string }

const STATUS_FILTERS: StatusFilter[] = ['pending', 'accepted', 'denied', 'all']
const STATUS_LABELS: Record<StatusFilter, string> = { pending: 'Pending', accepted: 'Accepted', denied: 'Denied', all: 'All' }
const STATUS_STYLES: Record<HiringStatus, string> = {
  pending: 'bg-status-warning-bg text-status-warning-text',
  accepted: 'bg-status-success-bg text-status-success-text',
  denied: 'bg-status-danger-bg text-status-danger-text',
}

const NOTICE_CLASSES: Record<Notice['tone'], string> = {
  success: 'border-status-success-text/30 bg-status-success-bg text-status-success-text',
  error: 'border-status-danger-text/30 bg-status-danger-bg text-status-danger-text',
}

const selectClass = 'rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent'
const pillClass = 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium'

// The year is only shown for an older application, to keep the column narrow.
const formatDate = (iso: string) => {
  const date = new Date(iso)
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' }),
  })
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(timer)
  }, [copied])

  return (
    <button
      type="button"
      onClick={async () => setCopied(await copyText(text))}
      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50"
    >
      {copied ? <Check className="h-4 w-4" strokeWidth={2} /> : <Copy className="h-4 w-4" strokeWidth={2} />}
      {copied ? 'Copied' : label}
    </button>
  )
}

// The stored URL is applicant input, so it only becomes a link when it is http(s).
function ProfileLink({ url, children }: { url: string; children: ReactNode }) {
  const href = safeExternalHref(url)
  if (!href) return <span className="text-xs text-gray-400">{url}</span>
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={url}
      className="inline-flex items-center gap-1 text-sm font-medium text-sky-700 hover:underline"
    >
      {children}
      <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} />
    </a>
  )
}

const yesNo = (value: boolean | null) => (value === null ? null : value ? 'Yes' : 'No')

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-gray-500">{label}</dt>
      <dd className="min-w-0 break-words font-medium text-gray-900">
        {children ?? <span className="font-normal text-gray-400">Not provided</span>}
      </dd>
    </>
  )
}

function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (next: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${checked ? 'bg-accent' : 'bg-gray-300'}`}
    >
      <span
        className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : ''}`}
      />
    </button>
  )
}

export function Hiring() {
  const { user: currentUser, refreshUser } = useAuth()
  const isAdmin = currentUser?.role === 'admin'
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [review, setReview] = useState<Review | null>(null)
  const [details, setDetails] = useState<HiringApplication | null>(null)
  const [credentials, setCredentials] = useState<Credentials | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [linkLeadId, setLinkLeadId] = useState('')
  const normalizedSearch = search.trim().toLowerCase()

  const { data: applications = [], isLoading, error: loadError } = useQuery({
    queryKey: ['hiring-applications'],
    queryFn: fetchApplications,
    refetchInterval: 30_000,
  })

  // Same key as the Users page. Only an admin can read other people's profiles,
  // so it is only needed there (lead names, and whose link to copy).
  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: async () => (await api.get<User[]>('/users')).data,
    enabled: isAdmin,
  })
  const leads = useMemo(() => (users ?? []).filter((u) => u.role === 'lead'), [users])
  const leadOptions = useMemo(() => leads.map((lead) => ({ value: lead.id, label: lead.name })), [leads])
  const leadNameById = useMemo(() => new Map(leads.map((lead) => [lead.id, lead.name])), [leads])

  const statusParam = searchParams.get('status')
  const statusFilter: StatusFilter = STATUS_FILTERS.find((s) => s === statusParam) ?? 'pending'
  const leadParam = searchParams.get('lead') ?? ''
  const leadFilter = isAdmin && leads.some((lead) => lead.id === leadParam) ? leadParam : ''

  function setFilter(key: 'status' | 'lead', value: string) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value) next.set(key, value)
        else next.delete(key)
        return next
      },
      { replace: true },
    )
  }

  // Success notices fade on their own; errors stay until dismissed.
  useEffect(() => {
    if (notice?.tone !== 'success') return
    const timer = window.setTimeout(() => setNotice(null), 6000)
    return () => window.clearTimeout(timer)
  }, [notice])

  const reviewMutation = useMutation({
    mutationFn: ({ application, decision }: Review) => reviewApplication(application.id, decision),
    onSuccess: (result: ReviewResult, { application, decision }) => {
      queryClient.invalidateQueries({ queryKey: ['hiring-applications'] })
      setReview(null)
      setError(null)
      if (decision === 'accept' && result.email && result.temporary_password) {
        // The new login shows up on the Users page (and the lead's team) straight away.
        queryClient.invalidateQueries({ queryKey: ['users'] })
        setCredentials({ name: application.full_name, email: result.email, password: result.temporary_password })
      } else {
        setNotice({ tone: 'success', text: `${application.full_name}'s application was denied.` })
      }
    },
    onError: (mutationError: Error) => setError(mutationError.message || 'Could not review this application.'),
  })

  const acceptingMutation = useMutation({
    mutationFn: (accepting: boolean) => setAcceptingApplications(effectiveLinkLeadId, accepting),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['users'] })
      // A lead's own switch lives on the profile the auth context holds.
      if (!isAdmin) await refreshUser()
    },
    onError: (mutationError: Error) =>
      setNotice({ tone: 'error', text: mutationError.message || 'Could not change whether applications are open.' }),
  })

  function openReview(next: Review) {
    setError(null)
    setReview(next)
  }

  // Whose application link to show: a lead's own, or (for an admin) the one they pick.
  const effectiveLinkLeadId = isAdmin
    ? leads.some((lead) => lead.id === linkLeadId)
      ? linkLeadId
      : (leads[0]?.id ?? '')
    : (currentUser?.id ?? '')
  const link = effectiveLinkLeadId ? applicationLink(effectiveLinkLeadId) : ''
  const linkLead = isAdmin ? leads.find((lead) => lead.id === effectiveLinkLeadId) : currentUser
  const accepting = linkLead?.accepting_applications ?? true

  const inScope = applications.filter((a) => !leadFilter || a.lead_id === leadFilter)
  const countOf = (status: StatusFilter) => (status === 'all' ? inScope.length : inScope.filter((a) => a.status === status).length)
  const rows = inScope
    .filter((a) => statusFilter === 'all' || a.status === statusFilter)
    .filter(
      (a) =>
        !normalizedSearch ||
        [a.full_name, a.remotasks_email, a.active_email, a.remotasks_id].some((v) => v.toLowerCase().includes(normalizedSearch)),
    )

  const columns = useMemo<ColumnDef<HiringApplication, any>[]>(
    () => [
      {
        id: 'applicant',
        accessorFn: (a) => a.full_name,
        header: 'Applicant',
        // Long names and emails are cut off with an ellipsis; the modal has them in full.
        cell: ({ row }) => {
          const applicant = row.original
          const issues = requirementIssues(applicant)
          return (
            <div className="max-w-72">
              <div title={applicant.full_name} className="truncate font-medium text-gray-900">
                {applicant.full_name}
              </div>
              <div title={applicant.active_email} className="truncate text-xs text-gray-400">
                {applicant.active_email}
              </div>
              {issues.length > 0 && (
                <span
                  title={issues.join(', ')}
                  className="mt-1 inline-flex rounded-full bg-status-danger-bg px-2 py-0.5 text-[10px] font-medium text-status-danger-text"
                >
                  Below requirements
                </span>
              )}
            </div>
          )
        },
      },
      {
        id: 'applied',
        accessorFn: (a) => new Date(a.created_at).getTime(),
        header: 'Applied',
        cell: ({ row }) => <span className="whitespace-nowrap text-gray-500">{formatDate(row.original.created_at)}</span>,
      },
      // A lead only ever sees their own applicants, so a Lead column would repeat one value.
      ...(isAdmin
        ? [
            {
              id: 'lead',
              accessorFn: (a: HiringApplication) => leadNameById.get(a.lead_id) ?? '',
              header: 'Lead',
              cell: ({ row }) => {
                const name = leadNameById.get(row.original.lead_id) ?? 'Unknown'
                return (
                  <span title={name} className="block max-w-40 truncate text-gray-600">
                    {name}
                  </span>
                )
              },
            } satisfies ColumnDef<HiringApplication, any>,
          ]
        : []),
      // Every other tab is already filtered to one status, so the pill would repeat it on each row.
      ...(statusFilter === 'all'
        ? [
            {
              id: 'status',
              accessorFn: (a: HiringApplication) => a.status,
              header: 'Status',
              cell: ({ row }) => (
                <span className={`${pillClass} ${STATUS_STYLES[row.original.status]}`}>{STATUS_LABELS[row.original.status]}</span>
              ),
            } satisfies ColumnDef<HiringApplication, any>,
          ]
        : []),
      {
        id: 'actions',
        header: 'Actions',
        enableSorting: false,
        meta: { align: 'right' },
        cell: ({ row }) => {
          const application = row.original
          return (
            <div className="flex items-center justify-end gap-2 whitespace-nowrap">
              <button
                type="button"
                onClick={() => setDetails(application)}
                aria-label={`View details for ${application.full_name}`}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50"
              >
                View
              </button>
              {application.status === 'pending' && (
                <>
                  <button
                    onClick={() => openReview({ application, decision: 'accept' })}
                    className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => openReview({ application, decision: 'deny' })}
                    className="rounded-lg border border-status-danger-text/30 px-3 py-1.5 text-xs font-semibold text-status-danger-text hover:bg-status-danger-bg"
                  >
                    Deny
                  </button>
                </>
              )}
              {application.status === 'accepted' && (
                <Link
                  to={`/contributors/${encodeURIComponent(application.remotasks_email)}`}
                  className="text-sm font-medium text-sky-700 hover:underline"
                >
                  Profile
                </Link>
              )}
            </div>
          )
        },
      },
    ],
    [isAdmin, leadNameById, statusFilter],
  )

  const loginDetails = credentials
    ? `Hi ${credentials.name}, your Grey Owls Tracker login is ready.\nSign in at ${window.location.origin}/login\nEmail: ${credentials.email}\nTemporary password: ${credentials.password}\nYou'll be asked to choose your own password when you first sign in.`
    : ''

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Hiring</h1>
        <p className="text-sm text-gray-500">
          {isAdmin
            ? "Review applicants from every lead's application link."
            : 'Share your application link, then accept or deny the people who apply.'}
        </p>
      </div>

      {notice && (
        <div
          role={notice.tone === 'error' ? 'alert' : 'status'}
          className={`mb-4 flex items-start justify-between gap-3 rounded-lg border px-4 py-2.5 text-sm ${NOTICE_CLASSES[notice.tone]}`}
        >
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} className="opacity-60 hover:opacity-100" aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}

      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-gray-700">Application link</h2>
          <div className="flex flex-wrap items-center gap-4">
            {isAdmin && leadOptions.length > 0 && (
              <Select
                value={effectiveLinkLeadId}
                aria-label="Whose application link"
                onChange={setLinkLeadId}
                options={leadOptions}
                className={selectClass}
              />
            )}
            {link && (
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <Switch
                  checked={accepting}
                  disabled={acceptingMutation.isPending}
                  onChange={(next) => acceptingMutation.mutate(next)}
                  label="Accepting applications"
                />
                {accepting ? 'Accepting applications' : 'Applications closed'}
              </div>
            )}
          </div>
        </div>
        {link ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              readOnly
              value={link}
              aria-label="Application link"
              onFocus={(e) => e.target.select()}
              className={`min-w-64 flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600 outline-none ${
                accepting ? '' : 'opacity-60'
              }`}
            />
            <CopyButton text={link} label="Copy link" />
          </div>
        ) : (
          <p className="text-sm text-gray-500">There are no leads yet. Give someone the lead role from the Users page to get a link.</p>
        )}
        <p className="mt-2 text-xs text-gray-400">
          {accepting
            ? `Anyone with this link can apply to ${isAdmin ? "that lead's" : 'your'} team. Accepting an applicant creates their login on the team.`
            : 'The form is switched off: anyone opening this link is told applications are closed. Applications you have already received stay below.'}
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label="Filter by status" className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
          {STATUS_FILTERS.map((status) => (
            <button
              key={status}
              role="tab"
              aria-selected={statusFilter === status}
              onClick={() => setFilter('status', status === 'pending' ? '' : status)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                statusFilter === status ? 'bg-accent-bg text-accent-foreground' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {STATUS_LABELS[status]}{' '}
              <span className={statusFilter === status ? 'opacity-70' : 'text-gray-400'}>{countOf(status)}</span>
            </button>
          ))}
        </div>
        <input
          type="search"
          placeholder="Search by name, email or ID..."
          aria-label="Search applicants"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`w-64 ${selectClass}`}
        />
        {isAdmin && (
          <Select
            value={leadFilter}
            aria-label="Filter by lead"
            onChange={(value) => setFilter('lead', value)}
            options={[{ value: '', label: 'All Leads' }, ...leadOptions]}
            className={selectClass}
          />
        )}
      </div>

      {loadError && (
        <div role="alert" className="mb-4 rounded-lg border border-status-danger-text/30 bg-status-danger-bg px-4 py-2.5 text-sm text-status-danger-text">
          {(loadError as Error).message || 'Could not load applications.'}
        </div>
      )}

      <DataTable
        columns={columns}
        data={rows}
        getRowId={(a) => String(a.id)}
        scrollX
        onRowClick={setDetails}
        isLoading={isLoading}
        emptyMessage={
          applications.length === 0
            ? 'No applications yet. Share your application link to start receiving them.'
            : 'No applications match these filters.'
        }
        rowClassName={(a) => (a.status === 'denied' ? 'opacity-60' : '')}
      />

      {details && (
        <Modal title={details.full_name} onClose={() => setDetails(null)} maxWidthClassName="max-w-lg">
          <div className="flex flex-col gap-5">
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">Personal information</h3>
              <dl className="grid grid-cols-[9rem_1fr] gap-x-4 gap-y-2 text-sm">
                <Detail label="Active email">{details.active_email}</Detail>
                <Detail label="Remotasks email">{details.remotasks_email}</Detail>
                <Detail label="Remotasks ID">{details.remotasks_id}</Detail>
                <Detail label="Facebook">
                  <ProfileLink url={details.facebook_url}>Open profile</ProfileLink>
                </Detail>
                <Detail label="Robotics background">{yesNo(details.has_robotics_background)}</Detail>
                <Detail label="Applied">{new Date(details.created_at).toLocaleString()}</Detail>
                {isAdmin && <Detail label="Lead">{leadNameById.get(details.lead_id) ?? 'Unknown'}</Detail>}
                {details.reviewed_at && <Detail label="Reviewed">{new Date(details.reviewed_at).toLocaleString()}</Detail>}
              </dl>
            </section>
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">Computer</h3>
              <p className="mb-2 text-xs text-gray-400">
                Requires a personal computer, stable internet, and Ryzen 3 / Intel i5 with at least {MIN_GPU_MEMORY_GB}GB GPU.
              </p>
              {requirementIssues(details).length > 0 && (
                <div role="alert" className="mb-3 rounded-lg bg-status-danger-bg px-3 py-2 text-sm text-status-danger-text">
                  Below requirements: {describeIssues(requirementIssues(details))}.
                </div>
              )}
              <dl className="grid grid-cols-[9rem_1fr] gap-x-4 gap-y-2 text-sm">
                <Detail label="Personal computer">{yesNo(details.has_personal_computer)}</Detail>
                <Detail label="Stable internet">{yesNo(details.has_stable_internet)}</Detail>
                <Detail label="Processor">{details.cpu}</Detail>
                <Detail label="Graphics card">{details.gpu}</Detail>
                <Detail label="GPU memory">{details.gpu_memory_gb === null ? null : `${Number(details.gpu_memory_gb)} GB`}</Detail>
              </dl>
            </section>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className={`${pillClass} ${STATUS_STYLES[details.status]}`}>{STATUS_LABELS[details.status]}</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDetails(null)}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600"
                >
                  Close
                </button>
                {details.status === 'pending' && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setDetails(null)
                        openReview({ application: details, decision: 'deny' })
                      }}
                      className="rounded-lg border border-status-danger-text/30 px-4 py-2 text-sm font-semibold text-status-danger-text hover:bg-status-danger-bg"
                    >
                      Deny
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDetails(null)
                        openReview({ application: details, decision: 'accept' })
                      }}
                      className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
                    >
                      Accept
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </Modal>
      )}

      {review && (
        <Modal
          title={review.decision === 'accept' ? `Accept ${review.application.full_name}?` : `Deny ${review.application.full_name}?`}
          onClose={() => setReview(null)}
        >
          <div className="flex flex-col gap-3">
            {review.decision === 'accept' ? (
              <p className="text-sm text-gray-600">
                This creates a login for <span className="font-medium text-gray-900">{review.application.full_name}</span> with the
                Remotasks email <span className="font-medium text-gray-900">{review.application.remotasks_email}</span>, on{' '}
                {isAdmin ? `${leadNameById.get(review.application.lead_id) ?? "the lead's"} team` : 'your team'}. You'll be given a
                temporary password to send them.
              </p>
            ) : (
              <p className="text-sm text-gray-600">
                <span className="font-medium text-gray-900">{review.application.full_name}</span>'s application will be marked
                denied and no login is created. They can apply again through the link.
              </p>
            )}
            {error && (
              <div role="alert" className="text-sm text-status-danger-text">
                {error}
              </div>
            )}
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReview(null)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={reviewMutation.isPending}
                onClick={() => reviewMutation.mutate(review)}
                className={`rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 ${
                  review.decision === 'accept' ? 'bg-accent text-accent-foreground' : 'bg-status-danger-text text-white'
                }`}
              >
                {reviewMutation.isPending ? 'Saving...' : review.decision === 'accept' ? 'Accept & create login' : 'Deny application'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {credentials && (
        <Modal title="Login created" onClose={() => setCredentials(null)}>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-gray-600">
              <span className="font-medium text-gray-900">{credentials.name}</span> has been accepted and added to the team. Send them
              these details — they'll choose their own password when they first sign in.
            </p>
            <dl className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
              <dt className="text-xs font-semibold uppercase tracking-wider text-gray-400">Email</dt>
              <dd className="mb-2 break-all font-medium text-gray-900">{credentials.email}</dd>
              <dt className="text-xs font-semibold uppercase tracking-wider text-gray-400">Temporary password</dt>
              <dd className="select-all font-mono font-medium text-gray-900">{credentials.password}</dd>
            </dl>
            <p className="text-xs text-gray-400">
              This password is only shown now. If it's lost, use Reset Password on the Users page to set a new one.
            </p>
            <div className="mt-2 flex justify-end gap-2">
              <CopyButton text={loginDetails} label="Copy login details" />
              <button
                type="button"
                onClick={() => setCredentials(null)}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
              >
                Done
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
