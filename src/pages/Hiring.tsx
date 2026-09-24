import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef, RowSelectionState } from '@tanstack/react-table'
import { Check, Copy, ExternalLink } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { toISODate } from '../lib/week'
import {
  applicationLink,
  clearHiring,
  createAccount,
  deleteApplications,
  describeIssues,
  emailApplicants,
  fetchApplications,
  LATE_GRACE_MINUTES,
  loadBootcampDetails,
  MAX_EMAIL_RECIPIENTS,
  MIN_GPU_MEMORY_GB,
  requirementIssues,
  reviewApplications,
  safeExternalHref,
  saveBootcampDetails,
  setAcceptingApplications,
  setOnboarded,
  setOnboardedBulk,
  type BootcampDetails,
} from '../lib/hiring'
import type { HiringApplication, HiringStatus, User } from '../types'
import { ActionsMenu } from '../components/ActionsMenu'
import { DataTable } from '../components/DataTable'
import { downloadCsv } from '../lib/csv'
import { Modal } from '../components/Modal'
import { Select } from '../components/Select'
import { contributorPath } from '../lib/urlRef'
import { RobotEmoji } from '../components/RobotEmoji'

type StatusFilter = HiringStatus | 'all'
type Notice = { tone: 'success' | 'error'; text: string }
// One applicant (a row's own Accept/Deny) or several at once (bulk, from "select all").
type Review = { applications: HiringApplication[]; decision: 'accept' | 'deny' }
type Credentials = { name: string; email: string; password: string; emailedTo?: string; emailError?: string }

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

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`
// For an export filename, like "2026-09-22".
const todayStamp = () => toISODate(new Date())

const inputClass = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent'
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
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [review, setReview] = useState<Review | null>(null)
  const [details, setDetails] = useState<HiringApplication | null>(null)
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [emailing, setEmailing] = useState<HiringApplication[] | null>(null)
  // The bootcamp the email is about. Remembered on this device after each send.
  const [bootcamp, setBootcamp] = useState<BootcampDetails>(loadBootcampDetails)
  const [creating, setCreating] = useState<HiringApplication | null>(null)
  const [credentials, setCredentials] = useState<Credentials | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [linkLeadId, setLinkLeadId] = useState('')
  const [clearingHiring, setClearingHiring] = useState(false)
  const [clearConfirmText, setClearConfirmText] = useState('')
  // One applicant (a row's own Delete) or several at once (bulk, from "select all").
  const [deleting, setDeleting] = useState<HiringApplication[] | null>(null)
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
    setRowSelection({})
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
    mutationFn: ({ applications, decision }: Review) => reviewApplications(applications, decision),
    onSuccess: (result, { applications, decision }) => {
      queryClient.invalidateQueries({ queryKey: ['hiring-applications'] })
      const verb = decision === 'accept' ? 'accepted' : 'denied'
      if (result.failed.length === 0) {
        setReview(null)
        setError(null)
        setRowSelection({})
        setNotice({
          tone: 'success',
          text:
            applications.length === 1
              ? decision === 'accept'
                ? `${applications[0].full_name} was accepted. Create their account from the Accepted tab when you're ready.`
                : `${applications[0].full_name}'s application was denied.`
              : `${plural(result.updated.length, 'application')} ${verb}.`,
        })
        return
      }
      // A single review just failed outright: keep the modal open so it can be retried, like before.
      if (applications.length === 1) {
        setError(result.failed[0].error)
        return
      }
      // Bulk, partial failure: close the modal, and leave only the ones that failed selected.
      setReview(null)
      setError(null)
      setRowSelection(Object.fromEntries(result.failed.map((failure) => [String(failure.id), true])))
      setNotice({
        tone: 'error',
        text: `${result.updated.length} of ${applications.length} ${verb}. Not done: ${result.failed
          .map((failure) => `${failure.name} (${failure.error})`)
          .join('; ')}. They're still selected so you can try again.`,
      })
    },
    onError: (mutationError: Error) => setError(mutationError.message || 'Could not review this application.'),
  })

  // A separate step from accepting: only an accepted applicant can be given an account.
  const createAccountMutation = useMutation({
    mutationFn: (application: HiringApplication) => createAccount(application.id),
    onSuccess: (result, application) => {
      queryClient.invalidateQueries({ queryKey: ['hiring-applications'] })
      // The new login shows up on the Users page (and the lead's team) straight away.
      queryClient.invalidateQueries({ queryKey: ['users'] })
      setCreating(null)
      setError(null)
      setCredentials({
        name: application.full_name,
        email: result.email,
        password: result.temporary_password,
        emailedTo: result.emailed_to,
        emailError: result.email_error,
      })
    },
    onError: (mutationError: Error) => setError(mutationError.message || 'Could not create this account.'),
  })

  // A simple toggle, not a confirmed step like accept/deny: it just flips onboarded_at.
  const onboardMutation = useMutation({
    mutationFn: ({ id, onboarded }: { id: number; onboarded: boolean }) => setOnboarded(id, onboarded),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['hiring-applications'] })
      // Keep the details modal in sync if it's open on the applicant that was just toggled.
      setDetails((current) => (current && current.id === result.id ? { ...current, onboarded_at: result.onboarded_at } : current))
    },
    onError: (mutationError: Error) => setNotice({ tone: 'error', text: mutationError.message || 'Could not update onboarding status.' }),
  })

  // The bulk version, for "select all, then mark onboarded" on the Accepted tab.
  const onboardBulkMutation = useMutation({
    mutationFn: ({ applications, onboarded }: { applications: HiringApplication[]; onboarded: boolean }) =>
      setOnboardedBulk(applications, onboarded),
    onSuccess: (result, { onboarded }) => {
      queryClient.invalidateQueries({ queryKey: ['hiring-applications'] })
      const verb = onboarded ? 'onboarded' : 'not onboarded'
      const total = result.updated.length + result.failed.length
      if (result.failed.length === 0) {
        setRowSelection({})
        setNotice({ tone: 'success', text: `${plural(result.updated.length, 'applicant')} marked ${verb}.` })
        return
      }
      setRowSelection(Object.fromEntries(result.failed.map((failure) => [String(failure.id), true])))
      setNotice({
        tone: 'error',
        text: `${result.updated.length} of ${total} marked ${verb}. Not done: ${result.failed
          .map((failure) => `${failure.name} (${failure.error})`)
          .join('; ')}. They're still selected so you can try again.`,
      })
    },
    onError: (mutationError: Error) => setNotice({ tone: 'error', text: mutationError.message || 'Could not update onboarding status.' }),
  })

  const deleteMutation = useMutation({
    mutationFn: (applications: HiringApplication[]) => deleteApplications(applications),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['hiring-applications'] })
      const total = result.updated.length + result.failed.length
      if (result.failed.length === 0) {
        setDeleting(null)
        setError(null)
        setRowSelection({})
        setDetails((current) => (current && result.updated.includes(current.id) ? null : current))
        setNotice({ tone: 'success', text: `Deleted ${plural(result.updated.length, 'application')}.` })
        return
      }
      // Total failure (e.g. every one belonged to another lead): keep the modal open to retry.
      if (result.updated.length === 0) {
        setError(result.failed[0].error)
        return
      }
      // Partial: close the modal, and leave only the ones that failed selected.
      setDeleting(null)
      setError(null)
      setRowSelection(Object.fromEntries(result.failed.map((failure) => [String(failure.id), true])))
      setNotice({
        tone: 'error',
        text: `Deleted ${result.updated.length} of ${total}. Not deleted: ${result.failed
          .map((failure) => `${failure.name} (${failure.error})`)
          .join('; ')}. They're still selected so you can try again.`,
      })
    },
    onError: (mutationError: Error) => setError(mutationError.message || 'Could not delete those applications.'),
  })

  const clearHiringMutation = useMutation({
    mutationFn: clearHiring,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['hiring-applications'] })
      setClearingHiring(false)
      setClearConfirmText('')
      setRowSelection({})
      setNotice({ tone: 'success', text: `Cleared ${plural(result.deleted, 'application')}.` })
    },
    onError: (mutationError: Error) => setError(mutationError.message || 'Could not clear hiring data.'),
  })

  const emailMutation = useMutation({
    mutationFn: ({ ids, details }: { ids: number[]; details: BootcampDetails }) => emailApplicants(ids, details),
    onSuccess: (result, { ids, details }) => {
      queryClient.invalidateQueries({ queryKey: ['hiring-applications'] })
      saveBootcampDetails(details)
      setEmailing(null)
      setError(null)
      // Anyone the email didn't reach stays selected, so it can be tried again.
      setRowSelection(Object.fromEntries(result.failed.map((failure) => [String(failure.id), true])))
      setNotice(
        result.failed.length === 0
          ? { tone: 'success', text: `Email sent to ${plural(result.sent.length, 'applicant')}.` }
          : {
              tone: 'error',
              text: `Sent to ${result.sent.length} of ${ids.length}. Not sent: ${result.failed.map((failure) => `${failure.name} (${failure.error})`).join('; ')}. They're still selected so you can try again.`,
            },
      )
    },
    onError: (mutationError: Error) => setError(mutationError.message || 'Could not send the email.'),
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

  function openCreate(application: HiringApplication) {
    setError(null)
    setCreating(application)
  }

  function openEmail() {
    setError(null)
    setEmailing(selected)
  }

  function openClearHiring() {
    setError(null)
    setClearConfirmText('')
    setClearingHiring(true)
  }

  function openDelete(applications: HiringApplication[]) {
    setError(null)
    setDeleting(applications)
  }

  // Every question the applicant answered, plus how their review turned out. Used for both
  // "Export all" (whatever the current filters show) and "Export selected".
  function exportApplications(list: HiringApplication[], filename: string) {
    downloadCsv(
      filename,
      list.map((a) => ({
        full_name: a.full_name,
        active_email: a.active_email,
        remotasks_email: a.remotasks_email,
        remotasks_id: a.remotasks_id,
        facebook_url: a.facebook_url,
        has_robotics_background: yesNo(a.has_robotics_background) ?? '',
        has_personal_computer: yesNo(a.has_personal_computer) ?? '',
        has_stable_internet: yesNo(a.has_stable_internet) ?? '',
        cpu: a.cpu ?? '',
        gpu: a.gpu ?? '',
        gpu_memory_gb: a.gpu_memory_gb ?? '',
        status: a.status,
        ...(isAdmin ? { lead: leadNameById.get(a.lead_id) ?? '' } : {}),
        applied_at: a.created_at,
        reviewed_at: a.reviewed_at ?? '',
        emailed_at: a.emailed_at ?? '',
        onboarded_at: a.onboarded_at ?? '',
        account_created: a.user_id ? 'yes' : 'no',
      })),
    )
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

  // Only rows that are showing count, so a search or filter can't leave someone hidden but still selected.
  const selected = rows.filter((a) => rowSelection[String(a.id)])

  const columns = useMemo<ColumnDef<HiringApplication, any>[]>(
    () => [
      {
        id: 'select',
        header: ({ table }) => (
          <input
            type="checkbox"
            // The rows on this page only, so "50 per page, select all" fits an email's 50-person limit.
            aria-label="Select all applicants on this page"
            checked={table.getIsAllPageRowsSelected()}
            ref={(el) => {
              if (el) el.indeterminate = table.getIsSomePageRowsSelected()
            }}
            onChange={table.getToggleAllPageRowsSelectedHandler()}
            className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent"
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            aria-label={`Select ${row.original.full_name}`}
            checked={row.getIsSelected()}
            onChange={row.getToggleSelectedHandler()}
            className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent"
          />
        ),
        enableSorting: false,
      } satisfies ColumnDef<HiringApplication, any>,
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
        id: 'facebook',
        header: 'Facebook',
        enableSorting: false,
        cell: ({ row }) => <ProfileLink url={row.original.facebook_url}>Profile</ProfileLink>,
      },
      {
        id: 'applied',
        accessorFn: (a) => new Date(a.created_at).getTime(),
        header: 'Applied',
        cell: ({ row }) => <span className="whitespace-nowrap text-gray-500">{formatDate(row.original.created_at)}</span>,
      },
      // Emailed, account and onboarded used to be three separate columns; one compact "Progress"
      // column reads faster and leaves less to scroll sideways for. Onboarded stays clickable.
      ...(statusFilter === 'accepted'
        ? [
            {
              id: 'progress',
              header: 'Progress',
              enableSorting: false,
              cell: ({ row }) => {
                const application = row.original
                const badge = (label: string, on: boolean, title: string) => (
                  <span
                    title={title}
                    className={`${pillClass} ${on ? 'bg-status-success-bg text-status-success-text' : 'border border-gray-200 text-gray-400'}`}
                  >
                    {label}
                  </span>
                )
                return (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {badge('Emailed', Boolean(application.emailed_at), application.emailed_at ? `Emailed ${new Date(application.emailed_at).toLocaleString()}` : 'Not emailed yet')}
                    {badge('Account', Boolean(application.user_id), application.user_id ? 'Account created' : 'Account not created yet')}
                    <button
                      type="button"
                      onClick={() => onboardMutation.mutate({ id: application.id, onboarded: !application.onboarded_at })}
                      disabled={onboardMutation.isPending}
                      title={
                        application.onboarded_at
                          ? `Onboarded ${new Date(application.onboarded_at).toLocaleString()}. Click to unmark.`
                          : 'Click to mark onboarded'
                      }
                      className={`${pillClass} disabled:opacity-50 ${
                        application.onboarded_at
                          ? 'bg-status-success-bg text-status-success-text hover:opacity-80'
                          : 'border border-gray-200 text-gray-400 hover:bg-gray-50'
                      }`}
                    >
                      Onboarded
                    </button>
                  </div>
                )
              },
            } satisfies ColumnDef<HiringApplication, any>,
          ]
        : []),
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
            <div className="flex justify-end">
              <ActionsMenu
                label={`Actions for ${application.full_name}`}
                items={[
                  { label: 'View', onClick: () => setDetails(application) },
                  ...(application.status === 'pending'
                    ? [
                        { label: 'Accept', onClick: () => openReview({ applications: [application], decision: 'accept' }) },
                        {
                          label: 'Deny',
                          variant: 'danger' as const,
                          onClick: () => openReview({ applications: [application], decision: 'deny' }),
                        },
                      ]
                    : []),
                  ...(application.status === 'accepted'
                    ? application.user_id
                      ? [
                          {
                            label: 'View profile',
                            onClick: () => navigate(contributorPath(application.remotasks_email)),
                          },
                        ]
                      : [{ label: 'Create account', onClick: () => openCreate(application) }]
                    : []),
                  { label: 'Delete', variant: 'danger' as const, onClick: () => openDelete([application]) },
                ]}
              />
            </div>
          )
        },
      },
    ],
    [isAdmin, leadNameById, statusFilter, onboardMutation, navigate],
  )

  const loginDetails = credentials
    ? `Hi ${credentials.name}, your Grey Owls Tracker login is ready.\nSign in at ${window.location.origin}/login\nEmail: ${credentials.email}\nTemporary password: ${credentials.password}\nYou'll be asked to choose your own password when you first sign in.`
    : ''

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            Hiring
            <RobotEmoji page="hiring" />
          </h1>
          <p className="text-sm text-gray-500">
            {isAdmin
              ? "Review applicants from every lead's application link."
              : 'Share your application link, then accept or deny the people who apply.'}
          </p>
        </div>
        {isAdmin && applications.length > 0 && (
          <button
            type="button"
            onClick={openClearHiring}
            className="rounded-lg border border-status-danger-text/30 px-3 py-2 text-sm font-semibold text-status-danger-text hover:bg-status-danger-bg"
          >
            Clear all hiring
          </button>
        )}
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
            ? `Anyone with this link can apply to ${isAdmin ? "that lead's" : 'your'} team. Accepting an applicant doesn't create their account; you do that from the Accepted tab.`
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
          onChange={(e) => {
            setSearch(e.target.value)
            setRowSelection({})
          }}
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
        <button
          type="button"
          onClick={() => exportApplications(rows, `hiring-${statusFilter}-${todayStamp()}.csv`)}
          disabled={rows.length === 0}
          className="ml-auto rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Export all
        </button>
      </div>

      {loadError && (
        <div role="alert" className="mb-4 rounded-lg border border-status-danger-text/30 bg-status-danger-bg px-4 py-2.5 text-sm text-status-danger-text">
          {(loadError as Error).message || 'Could not load applications.'}
        </div>
      )}

      {selected.length > 0 && (
        <div className="sticky top-0 z-10 mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 shadow-sm">
          <span className="text-sm font-medium text-gray-700">{selected.length} selected</span>
          {statusFilter === 'pending' && (
            <>
              <button
                onClick={() => openReview({ applications: selected, decision: 'accept' })}
                className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-foreground"
              >
                Accept selected
              </button>
              <button
                onClick={() => openReview({ applications: selected, decision: 'deny' })}
                className="rounded-lg border border-status-danger-text/30 px-3 py-1.5 text-sm font-semibold text-status-danger-text hover:bg-status-danger-bg"
              >
                Deny selected
              </button>
            </>
          )}
          {statusFilter === 'accepted' && (
            <>
              <button onClick={openEmail} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-foreground">
                Send email
              </button>
              <button
                onClick={() => onboardBulkMutation.mutate({ applications: selected, onboarded: true })}
                disabled={onboardBulkMutation.isPending}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Mark onboarded
              </button>
              <button
                onClick={() => onboardBulkMutation.mutate({ applications: selected, onboarded: false })}
                disabled={onboardBulkMutation.isPending}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Mark not onboarded
              </button>
            </>
          )}
          <button
            onClick={() => exportApplications(selected, `hiring-selected-${todayStamp()}.csv`)}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Export selected
          </button>
          <button
            onClick={() => openDelete(selected)}
            className="rounded-lg border border-status-danger-text/30 px-3 py-1.5 text-sm font-semibold text-status-danger-text hover:bg-status-danger-bg"
          >
            Delete selected
          </button>
          <button onClick={() => setRowSelection({})} className="ml-auto text-sm font-medium text-gray-500 hover:underline">
            Clear selection
          </button>
        </div>
      )}
      {statusFilter === 'pending' && selected.length === 0 && rows.length > 0 && (
        <p className="mb-3 text-xs text-gray-400">
          Tick one or more applicants to accept, deny, export or delete them together.
        </p>
      )}
      {statusFilter === 'accepted' && selected.length === 0 && rows.length > 0 && (
        <p className="mb-3 text-xs text-gray-400">
          Tick one or more applicants to email, mark onboarded, export or delete them together.
        </p>
      )}
      {(statusFilter === 'denied' || statusFilter === 'all') && selected.length === 0 && rows.length > 0 && (
        <p className="mb-3 text-xs text-gray-400">Tick one or more applicants to export or delete them together.</p>
      )}

      <DataTable
        columns={columns}
        data={rows}
        getRowId={(a) => String(a.id)}
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
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
        <Modal title={details.full_name} onClose={() => setDetails(null)} maxWidthClassName="max-w-4xl">
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
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
                  {details.status === 'accepted' && (
                    <Detail label="Emailed">{details.emailed_at ? new Date(details.emailed_at).toLocaleString() : 'Not yet'}</Detail>
                  )}
                  {details.status === 'accepted' && <Detail label="Account">{details.user_id ? 'Created' : 'Not created yet'}</Detail>}
                  {details.status === 'accepted' && (
                    <Detail label="Onboarded">{details.onboarded_at ? new Date(details.onboarded_at).toLocaleString() : 'Not yet'}</Detail>
                  )}
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
            </div>
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
                {details.status === 'accepted' && !details.user_id && (
                  <button
                    type="button"
                    onClick={() => {
                      setDetails(null)
                      openCreate(details)
                    }}
                    className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
                  >
                    Create account
                  </button>
                )}
                {details.status === 'accepted' && (
                  <button
                    type="button"
                    onClick={() => onboardMutation.mutate({ id: details.id, onboarded: !details.onboarded_at })}
                    disabled={onboardMutation.isPending}
                    className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {onboardMutation.isPending ? 'Saving...' : details.onboarded_at ? 'Mark not onboarded' : 'Mark onboarded'}
                  </button>
                )}
                {details.status === 'pending' && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setDetails(null)
                        openReview({ applications: [details], decision: 'deny' })
                      }}
                      className="rounded-lg border border-status-danger-text/30 px-4 py-2 text-sm font-semibold text-status-danger-text hover:bg-status-danger-bg"
                    >
                      Deny
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDetails(null)
                        openReview({ applications: [details], decision: 'accept' })
                      }}
                      className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
                    >
                      Accept
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setDetails(null)
                    openDelete([details])
                  }}
                  className="rounded-lg border border-status-danger-text/30 px-4 py-2 text-sm font-semibold text-status-danger-text hover:bg-status-danger-bg"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {emailing && (
        <Modal title={`Send email to ${plural(emailing.length, 'applicant')}?`} onClose={() => setEmailing(null)}>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-gray-600">
              Each person is emailed at their active email address, from their lead. Replies go to their lead.
            </p>
            <fieldset className="rounded-lg border border-gray-200 px-3 pb-3 pt-1">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-gray-400">Bootcamp details</legend>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="bootcamp-date" className="mb-1 block text-xs font-medium text-gray-600">
                    Date
                  </label>
                  <input
                    id="bootcamp-date"
                    type="date"
                    value={bootcamp.date}
                    onChange={(e) => setBootcamp({ ...bootcamp, date: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="bootcamp-time" className="mb-1 block text-xs font-medium text-gray-600">
                    Start time (PH time)
                  </label>
                  <input
                    id="bootcamp-time"
                    type="time"
                    value={bootcamp.time}
                    onChange={(e) => setBootcamp({ ...bootcamp, time: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div className="col-span-2">
                  <label htmlFor="bootcamp-project" className="mb-1 block text-xs font-medium text-gray-600">
                    Project
                  </label>
                  <input
                    id="bootcamp-project"
                    type="text"
                    maxLength={100}
                    value={bootcamp.project}
                    onChange={(e) => setBootcamp({ ...bootcamp, project: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div className="col-span-2">
                  <label htmlFor="bootcamp-link" className="mb-1 block text-xs font-medium text-gray-600">
                    Google Meet link
                  </label>
                  <input
                    id="bootcamp-link"
                    type="url"
                    placeholder="https://meet.google.com/..."
                    value={bootcamp.meetUrl}
                    onChange={(e) => setBootcamp({ ...bootcamp, meetUrl: e.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>
              <p className="mt-2 text-xs text-gray-400">
                The email tells them the Meet stops letting people in {LATE_GRACE_MINUTES} minutes after the start.
              </p>
            </fieldset>
            <ul className="max-h-40 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200 text-sm">
              {emailing.map((applicant) => (
                <li key={applicant.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-gray-900">{applicant.full_name}</div>
                    <div className="truncate text-xs text-gray-400">{applicant.active_email}</div>
                  </div>
                  {applicant.emailed_at && (
                    <span className={`${pillClass} shrink-0 bg-status-warning-bg text-status-warning-text`}>Already emailed</span>
                  )}
                </li>
              ))}
            </ul>
            {emailing.some((applicant) => applicant.emailed_at) && (
              <p className="text-xs text-status-warning-text">
                {plural(emailing.filter((applicant) => applicant.emailed_at).length, 'person')} already received this email and will get it again.
              </p>
            )}
            {emailing.length > MAX_EMAIL_RECIPIENTS && (
              <div role="alert" className="text-sm text-status-danger-text">
                You can email at most {MAX_EMAIL_RECIPIENTS} people at a time. Untick some and send again.
              </div>
            )}
            {error && (
              <div role="alert" className="text-sm text-status-danger-text">
                {error}
              </div>
            )}
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEmailing(null)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  emailMutation.isPending ||
                  emailing.length > MAX_EMAIL_RECIPIENTS ||
                  !bootcamp.date ||
                  !bootcamp.time ||
                  !bootcamp.project.trim() ||
                  !bootcamp.meetUrl.trim()
                }
                onClick={() => emailMutation.mutate({ ids: emailing.map((applicant) => applicant.id), details: bootcamp })}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
              >
                {emailMutation.isPending ? 'Sending...' : `Send ${plural(emailing.length, 'email')}`}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {creating && (
        <Modal title={`Create an account for ${creating.full_name}?`} onClose={() => setCreating(null)}>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-gray-600">
              This creates a login for <span className="font-medium text-gray-900">{creating.full_name}</span> with the Remotasks email{' '}
              <span className="font-medium text-gray-900">{creating.remotasks_email}</span>, on{' '}
              {isAdmin ? `${leadNameById.get(creating.lead_id) ?? "the lead's"} team` : 'your team'}. A temporary password is emailed to{' '}
              <span className="font-medium text-gray-900">{creating.active_email}</span> and shown to you once. They'll choose their own
              password when they first sign in.
            </p>
            {error && (
              <div role="alert" className="text-sm text-status-danger-text">
                {error}
              </div>
            )}
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreating(null)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={createAccountMutation.isPending}
                onClick={() => createAccountMutation.mutate(creating)}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
              >
                {createAccountMutation.isPending ? 'Creating...' : 'Create account'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {review &&
        (() => {
          const isSingle = review.applications.length === 1
          const person = review.applications[0]
          const verb = review.decision === 'accept' ? 'accepted' : 'denied'
          return (
            <Modal
              title={
                isSingle
                  ? `${review.decision === 'accept' ? 'Accept' : 'Deny'} ${person.full_name}?`
                  : `${review.decision === 'accept' ? 'Accept' : 'Deny'} ${plural(review.applications.length, 'application')}?`
              }
              onClose={() => setReview(null)}
            >
              <div className="flex flex-col gap-3">
                {isSingle ? (
                  <p className="text-sm text-gray-600">
                    <span className="font-medium text-gray-900">{person.full_name}</span>'s application will be marked {verb}.{' '}
                    {review.decision === 'accept'
                      ? "No account is created yet: you can do that afterwards, from the Accepted tab, when you're ready."
                      : 'No login is created. They can apply again through the link.'}
                  </p>
                ) : (
                  <>
                    <p className="text-sm text-gray-600">
                      {plural(review.applications.length, 'application')} will be marked {verb}.{' '}
                      {review.decision === 'accept'
                        ? "No accounts are created yet: you can do that afterwards, from the Accepted tab, when you're ready."
                        : 'No logins are created. They can apply again through the link.'}
                    </p>
                    <ul className="max-h-40 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200 text-sm">
                      {review.applications.map((application) => (
                        <li key={application.id} className="truncate px-3 py-2 font-medium text-gray-900">
                          {application.full_name}
                        </li>
                      ))}
                    </ul>
                  </>
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
                    {reviewMutation.isPending
                      ? 'Saving...'
                      : `${review.decision === 'accept' ? 'Accept' : 'Deny'}${isSingle ? ' application' : ` ${review.applications.length}`}`}
                  </button>
                </div>
              </div>
            </Modal>
          )
        })()}

      {credentials && (
        <Modal title="Account created" onClose={() => setCredentials(null)}>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-gray-600">
              <span className="font-medium text-gray-900">{credentials.name}</span>'s account has been created and added to the team.{' '}
              {credentials.emailedTo
                ? "They'll choose their own password when they first sign in."
                : "Send them these details — they'll choose their own password when they first sign in."}
            </p>
            {credentials.emailedTo ? (
              <p role="status" className="rounded-lg bg-status-success-bg px-3 py-2 text-sm text-status-success-text">
                We emailed these details to {credentials.emailedTo}.
              </p>
            ) : credentials.emailError ? (
              <p role="alert" className="rounded-lg bg-status-warning-bg px-3 py-2 text-sm text-status-warning-text">
                We couldn't email them: {credentials.emailError} Send them the details yourself.
              </p>
            ) : null}
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

      {deleting && (
        <Modal title={`Delete ${plural(deleting.length, 'application')}?`} onClose={() => setDeleting(null)}>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-gray-600">
              This permanently deletes {plural(deleting.length, 'application')}. It cannot be undone. Any contributor account already
              created from one of them is not affected; only the application record is removed.
            </p>
            <ul className="max-h-40 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200 text-sm">
              {deleting.map((application) => (
                <li key={application.id} className="truncate px-3 py-2 font-medium text-gray-900">
                  {application.full_name}
                </li>
              ))}
            </ul>
            {error && (
              <div role="alert" className="text-sm text-status-danger-text">
                {error}
              </div>
            )}
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleting(null)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(deleting)}
                className="rounded-lg bg-status-danger-text px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Deleting...' : `Delete ${plural(deleting.length, 'application')}`}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {clearingHiring && (
        <Modal title="Clear all hiring data?" onClose={() => setClearingHiring(false)}>
          <div className="flex flex-col gap-3">
            <p className="text-sm text-gray-600">
              This permanently deletes all <span className="font-medium text-gray-900">{plural(applications.length, 'application')}</span>{' '}
              — pending, accepted and denied, from every lead. It cannot be undone. Any contributor account already created from one of
              them is not affected; only the application history is removed.
            </p>
            <label htmlFor="clear-hiring-confirm" className="text-sm font-medium text-gray-700">
              Type <span className="font-mono font-semibold">CLEAR</span> to confirm.
            </label>
            <input
              id="clear-hiring-confirm"
              type="text"
              value={clearConfirmText}
              onChange={(e) => setClearConfirmText(e.target.value)}
              autoComplete="off"
              className={inputClass}
            />
            {error && (
              <div role="alert" className="text-sm text-status-danger-text">
                {error}
              </div>
            )}
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setClearingHiring(false)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={clearHiringMutation.isPending || clearConfirmText !== 'CLEAR'}
                onClick={() => clearHiringMutation.mutate()}
                className="rounded-lg bg-status-danger-text px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {clearHiringMutation.isPending ? 'Clearing...' : 'Clear all hiring data'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
