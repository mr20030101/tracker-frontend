import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bug, ImagePlus, Lightbulb, RotateCw, Send, Trash2, Undo2, X } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { errorMessage } from '../lib/api'
import { APP_VERSION } from '../lib/version'
import { confirmDialog } from '../lib/dialog'
import { contributorPath } from '../lib/urlRef'
import { usePageTitle } from '../lib/usePageTitle'
import {
  MAX_SUPPORT_SCREENSHOTS,
  SUPPORT_KIND_LABELS,
  SUPPORT_STATUSES,
  SUPPORT_STATUS_LABELS,
  deleteSupportTicket,
  fetchSupportReplies,
  fetchSupportScreenshot,
  fetchSupportStatusCounts,
  fetchSupportTicket,
  fetchSupportTicketsPage,
  fileSupportTicket,
  hasUnseenSupportActivity,
  markSupportTicketSeen,
  postSupportReply,
  screenshotToJpeg,
  setSupportTicketStatus,
  uploadSupportScreenshot,
  type SupportFilters,
  type SupportKind,
  type SupportStatus,
} from '../lib/support'
import { FoldText } from '../components/FoldText'
import { FormattedText } from '../components/FormattedText'
import { Modal } from '../components/Modal'
import { Detail } from '../components/Detail'
import { Select } from '../components/Select'
import { Avatar } from '../components/Avatar'
import { PAGE_SIZE, PageFooter } from '../components/PageFooter'
import { FilterBar, FilterField, SearchInput, SegmentedTabs, TableCard, toolbarControlClass } from '../components/TableToolbar'

type StatusTab = SupportFilters['status']
const STATUS_TABS: StatusTab[] = ['active', 'done', 'wont_do', 'all']
const TAB_LABELS: Record<StatusTab, string> = { active: 'Active', ...SUPPORT_STATUS_LABELS, all: 'All' }

const STATUS_STYLES: Record<SupportStatus, string> = {
  open: 'bg-status-warning-bg text-status-warning-text',
  in_progress: 'bg-accent-bg text-accent-on-bg',
  done: 'bg-status-success-bg text-status-success-text',
  wont_do: 'bg-status-neutral-bg text-status-neutral-text',
}
const KIND_ICONS = { bug: Bug, feature: Lightbulb }

const pillClass = 'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium'
const inputClass = 'rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent'
const secondaryButton =
  'inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50'

const timeAgo = (iso: string) => {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h ago`
  return new Date(iso).toLocaleDateString()
}

export function Support() {
  usePageTitle('Support')
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [params, setParams] = useSearchParams()
  const [statusTab, setStatusTab] = useState<StatusTab>('active')
  const [kind, setKind] = useState<SupportKind | 'all'>('all')
  const [search, setSearch] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    const timer = setTimeout(() => setSearchTerm(search.trim()), 300)
    return () => clearTimeout(timer)
  }, [search])
  useEffect(() => setPage(1), [statusTab, kind, searchTerm])

  // ?new=bug|feature&from=/path opens the form (the account menu's "Report a problem");
  // ?ticket=<id> opens one ticket, so a ticket has a link.
  const newKind = params.get('new')
  const fromPage = params.get('from')
  const openTicketId = Number(params.get('ticket')) || null
  const closeOverlay = () => setParams({}, { replace: true })

  const filters = { status: statusTab, kind, search: searchTerm }
  const { data: pageData, isLoading } = useQuery({
    queryKey: ['support', 'page', filters, page],
    queryFn: () => fetchSupportTicketsPage({ ...filters, page, pageSize: PAGE_SIZE }),
    refetchInterval: 2 * 60_000,
    placeholderData: (previous) => previous,
  })
  const { data: counts } = useQuery({
    queryKey: ['support', 'counts', kind, searchTerm],
    queryFn: () => fetchSupportStatusCounts(kind, searchTerm),
    refetchInterval: 2 * 60_000,
  })
  const rows = pageData?.rows ?? []
  const columns = isAdmin ? 5 : 4

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-medium text-gray-900 sm:text-4xl">
            <FoldText text="Support" />
          </h1>
          <p className="text-sm text-gray-500">
            {isAdmin
              ? 'Bugs and feature requests from everyone. Set a status and reply; the reporter sees both.'
              : "Something broken, or something you wish the tracker did? Tell us here and follow the replies."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setParams({ new: 'feature' })} className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            <Lightbulb className="h-4 w-4" aria-hidden />
            Request a feature
          </button>
          <button type="button" onClick={() => setParams({ new: 'bug' })} className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground">
            <Bug className="h-4 w-4" aria-hidden />
            Report a bug
          </button>
        </div>
      </div>

      <TableCard
        toolbar={
          <FilterBar
            active={(search ? 1 : 0) + (kind !== 'all' ? 1 : 0) + (statusTab !== 'active' ? 1 : 0)}
            onReset={() => {
              setSearch('')
              setKind('all')
              setStatusTab('active')
            }}
          >
            <FilterField label="Status" wide>
              <SegmentedTabs
                aria-label="Filter by status"
                value={statusTab}
                onChange={setStatusTab}
                options={STATUS_TABS.map((tab) => ({ value: tab, label: TAB_LABELS[tab], count: counts?.[tab] }))}
              />
            </FilterField>
            <FilterField label="Search" id="support-search">
              <SearchInput id="support-search" value={search} onChange={setSearch} placeholder={isAdmin ? 'Title, #id or reporter' : 'Title or #id'} />
            </FilterField>
            <FilterField label="Type" id="support-kind">
              <Select
                id="support-kind"
                fullWidth
                className={toolbarControlClass}
                value={kind}
                onChange={(value) => setKind(value as SupportKind | 'all')}
                options={[
                  { value: 'all', label: 'Bugs and features' },
                  { value: 'bug', label: 'Bugs' },
                  { value: 'feature', label: 'Feature requests' },
                ]}
              />
            </FilterField>
          </FilterBar>
        }
      >
        <table className="w-full min-w-[44rem] text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
            <tr>
              <th className="px-5 py-3">Ticket</th>
              {isAdmin && <th className="px-5 py-3">Reported by</th>}
              <th className="px-5 py-3">Type</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3 text-right">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading && (
              <tr>
                <td colSpan={columns} className="px-5 py-6 text-center text-gray-400">
                  Loading...
                </td>
              </tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={columns} className="px-5 py-10 text-center text-gray-400">
                  {statusTab === 'active' && !searchTerm && kind === 'all'
                    ? isAdmin
                      ? 'Nothing waiting. All clear.'
                      : "You haven't reported anything that's still open."
                    : 'No tickets match these filters.'}
                </td>
              </tr>
            )}
            {rows.map((ticket) => {
              const unseen = ticket.user_id === user?.id && hasUnseenSupportActivity(ticket)
              const KindIcon = KIND_ICONS[ticket.kind]
              return (
                <tr key={ticket.id} onClick={() => setParams({ ticket: String(ticket.id) })} className="cursor-pointer align-top hover:bg-gray-50">
                  <td className="max-w-md px-5 py-3">
                    <div className="flex items-start gap-2">
                      {unseen && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" title="New reply or status change" />}
                      <div className="min-w-0">
                        <div className={`truncate ${unseen ? 'font-semibold text-gray-900' : 'font-medium text-gray-800'}`}>{ticket.title}</div>
                        <div className="mt-0.5 text-xs text-gray-400">
                          #{ticket.id} · {new Date(ticket.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  </td>
                  {isAdmin && (
                    <td className="px-5 py-3">
                      {ticket.reporter ? (
                        <>
                          <div className="font-medium text-gray-800">{ticket.reporter.name}</div>
                          <div className="text-xs capitalize text-gray-400">{ticket.reporter.role}</div>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                  )}
                  <td className="px-5 py-3 text-gray-600">
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      <KindIcon className="h-4 w-4 text-gray-400" aria-hidden />
                      {SUPPORT_KIND_LABELS[ticket.kind]}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`${pillClass} ${STATUS_STYLES[ticket.status]}`}>{SUPPORT_STATUS_LABELS[ticket.status]}</span>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-right text-xs text-gray-500">{timeAgo(ticket.updated_at)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {pageData && <PageFooter page={page} total={pageData.total} onPage={setPage} />}
      </TableCard>

      {(newKind === 'bug' || newKind === 'feature') && (
        <NewTicketModal
          key={newKind}
          initialKind={newKind}
          fromPage={fromPage && fromPage.startsWith('/') ? fromPage : null}
          onClose={closeOverlay}
          onFiled={(id) => setParams({ ticket: String(id) }, { replace: true })}
        />
      )}
      {openTicketId && <TicketModal key={openTicketId} ticketId={openTicketId} onClose={closeOverlay} />}
    </div>
  )
}

// One screenshot in the form: re-encoded and uploading, uploaded, or failed (kept, with Retry).
interface PendingShot {
  key: number
  name: string
  jpeg: Blob | null
  preview: string
  size: number
  progress: number
  state: 'uploading' | 'done' | 'error'
  ref?: string
  error?: string
}

const formatBytes = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`)

function NewTicketModal({
  initialKind,
  fromPage,
  onClose,
  onFiled,
}: {
  initialKind: SupportKind
  fromPage: string | null
  onClose: () => void
  onFiled: (id: number) => void
}) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [kind, setKind] = useState<SupportKind>(initialKind)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [shots, setShots] = useState<PendingShot[]>([])
  const [dragging, setDragging] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [invalid, setInvalid] = useState<{ title?: boolean; body?: boolean }>({})
  const titleRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const nextKey = useRef(1)
  const ids = { title: useId(), body: useId() }
  const shotsRef = useRef(shots)
  shotsRef.current = shots

  useEffect(() => () => shotsRef.current.forEach((shot) => URL.revokeObjectURL(shot.preview)), [])

  const patch = (key: number, change: Partial<PendingShot>) => setShots((all) => all.map((s) => (s.key === key ? { ...s, ...change } : s)))

  const send = (key: number, jpeg: Blob) => {
    patch(key, { state: 'uploading', progress: 0, error: undefined })
    uploadSupportScreenshot(jpeg, (progress) => patch(key, { progress }))
      .then((ref) => patch(key, { state: 'done', progress: 1, ref }))
      .catch((error: unknown) => patch(key, { state: 'error', error: errorMessage(error, "Couldn't upload this screenshot.") }))
  }

  const addFiles = (files: File[]) => {
    const images = files.filter((file) => file.type.startsWith('image/'))
    if (files.length && !images.length) {
      setFormError('Only images can be added as screenshots.')
      return
    }
    const room = MAX_SUPPORT_SCREENSHOTS - shotsRef.current.length
    if (images.length > room) setFormError(`Up to ${MAX_SUPPORT_SCREENSHOTS} screenshots per report.`)
    for (const file of images.slice(0, Math.max(0, room))) {
      const key = nextKey.current++
      const preview = URL.createObjectURL(file)
      setShots((all) => [...all, { key, name: file.name || 'Pasted screenshot', jpeg: null, preview, size: file.size, progress: 0, state: 'uploading' }])
      screenshotToJpeg(file)
        .then((jpeg) => {
          patch(key, { jpeg, size: jpeg.size })
          send(key, jpeg)
        })
        .catch((error: unknown) => patch(key, { state: 'error', error: errorMessage(error, 'That image could not be read.') }))
    }
  }

  const removeShot = (key: number) =>
    setShots((all) => {
      const shot = all.find((s) => s.key === key)
      if (shot) URL.revokeObjectURL(shot.preview)
      return all.filter((s) => s.key !== key)
    })

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? [])
      if (files.some((file) => file.type.startsWith('image/'))) {
        e.preventDefault()
        addFiles(files)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- addFiles only reads refs and setters
  }, [])

  const fileMutation = useMutation({
    mutationFn: () => {
      if (!user) throw new Error('Sign in again to send this.')
      return fileSupportTicket({
        userId: user.id,
        kind,
        title,
        body,
        page: fromPage,
        appVersion: APP_VERSION,
        screenshotRefs: shots.flatMap((shot) => (shot.ref ? [shot.ref] : [])),
      })
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ['support'] })
      onFiled(id)
    },
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (fileMutation.isPending) return
    const problems = { title: title.trim().length < 3, body: !body.trim() }
    setInvalid(problems)
    if (problems.title || problems.body) {
      setFormError(problems.title ? 'Give it a short title (at least 3 characters).' : 'Describe what happened.')
      ;(problems.title ? titleRef : bodyRef).current?.focus()
      return
    }
    if (shots.some((shot) => shot.state === 'uploading')) {
      setFormError('Wait for the screenshots to finish uploading.')
      return
    }
    if (shots.some((shot) => shot.state === 'error')) {
      setFormError('A screenshot failed to upload. Retry it or remove it.')
      return
    }
    setFormError(null)
    fileMutation.mutate()
  }

  const placeholder =
    kind === 'bug'
      ? 'What did you do, what did you expect, and what happened instead?\n\n1. Went to ...\n2. Clicked ...\n3. Saw ...'
      : 'What would you like the tracker to do, and what would it help you with?'

  return (
    <Modal title={kind === 'bug' ? 'Report a bug' : 'Request a feature'} onClose={onClose} maxWidthClassName="max-w-xl">
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <fieldset className="grid grid-cols-2 gap-2">
          <legend className="sr-only">Type</legend>
          {(['bug', 'feature'] as const).map((option) => {
            const Icon = KIND_ICONS[option]
            return (
              <label
                key={option}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-700 transition-colors duration-100 hover:bg-gray-50 has-[:checked]:border-accent has-[:checked]:bg-accent-bg has-[:checked]:text-accent-on-bg"
              >
                <input type="radio" name="kind" value={option} checked={kind === option} onChange={() => setKind(option)} className="sr-only" />
                <Icon className="h-4 w-4" aria-hidden />
                <span className="font-medium">{SUPPORT_KIND_LABELS[option]}</span>
              </label>
            )
          })}
        </fieldset>

        <label htmlFor={ids.title} className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-gray-700">Title</span>
          <input
            id={ids.title}
            ref={titleRef}
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={150}
            aria-invalid={invalid.title || undefined}
            placeholder={kind === 'bug' ? 'e.g. Timer stops when I switch tabs' : 'e.g. Show my weekly hours on the Dashboard'}
            className={`${inputClass} ${invalid.title ? 'border-status-danger-text' : ''}`}
          />
        </label>

        <label htmlFor={ids.body} className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-gray-700">{kind === 'bug' ? 'What happened' : 'Details'}</span>
          <textarea
            id={ids.body}
            ref={bodyRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={5000}
            rows={6}
            aria-invalid={invalid.body || undefined}
            placeholder={placeholder}
            className={`${inputClass} ${invalid.body ? 'border-status-danger-text' : ''}`}
          />
        </label>

        <div className="flex flex-col gap-2 text-sm">
          <span className="font-medium text-gray-700">
            Screenshots <span className="font-normal text-gray-400">(optional, up to {MAX_SUPPORT_SCREENSHOTS})</span>
          </span>
          {shots.length > 0 && (
            <ul className="flex flex-col gap-2">
              {shots.map((shot) => (
                <li key={shot.key} className="flex items-center gap-3 rounded-lg border border-gray-200 p-2">
                  <img src={shot.preview} alt="" className="h-12 w-16 shrink-0 rounded border border-gray-100 object-cover" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium text-gray-700">{shot.name}</div>
                    <div className="text-xs text-gray-400">
                      JPEG · {formatBytes(shot.size)}
                      {shot.state === 'uploading' && ` · ${Math.round(shot.progress * 100)}%`}
                      {shot.state === 'done' && ' · Uploaded'}
                    </div>
                    {shot.state === 'uploading' && (
                      <div className="mt-1 h-1 overflow-hidden rounded-full bg-gray-100">
                        <div className="h-full bg-accent transition-[width] duration-150" style={{ width: `${Math.round(shot.progress * 100)}%` }} />
                      </div>
                    )}
                    {shot.state === 'error' && <div className="text-xs text-status-danger-text">{shot.error}</div>}
                  </div>
                  {shot.state === 'error' && shot.jpeg && (
                    <button type="button" onClick={() => send(shot.key, shot.jpeg!)} className={secondaryButton}>
                      <RotateCw className="h-3.5 w-3.5" aria-hidden />
                      Retry
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => removeShot(shot.key)}
                    aria-label={`Remove ${shot.name}`}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {shots.length < MAX_SUPPORT_SCREENSHOTS && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragging(false)
                addFiles(Array.from(e.dataTransfer.files))
              }}
              className={`flex flex-col items-center gap-1 rounded-lg border border-dashed px-4 py-5 text-center transition-colors duration-100 ${
                dragging ? 'border-accent bg-accent-bg text-accent-on-bg' : 'border-gray-300 text-gray-500 hover:bg-gray-50'
              }`}
            >
              <ImagePlus className="h-5 w-5" aria-hidden />
              <span className="text-sm font-medium">{dragging ? 'Drop to add' : 'Add a screenshot'}</span>
              <span className="text-xs text-gray-400">Click, drop an image here, or paste one (Ctrl/⌘ V)</span>
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              addFiles(Array.from(e.target.files ?? []))
              e.target.value = ''
            }}
          />
        </div>

        {fromPage && (
          <p className="text-xs text-gray-400">
            Sent with the page you came from (<span className="font-mono">{fromPage}</span>), the app version ({APP_VERSION}) and your browser, to help us find it.
          </p>
        )}

        {(formError || fileMutation.isError) && (
          <div role="alert" className="text-sm text-status-danger-text">
            {formError ?? errorMessage(fileMutation.error, "Couldn't send this. Please try again.")}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600">
            Cancel
          </button>
          <button
            type="submit"
            aria-busy={fileMutation.isPending || undefined}
            className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
          >
            <Send className="h-4 w-4" aria-hidden />
            {fileMutation.isPending ? 'Sending...' : 'Send'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function TicketModal({ ticketId, onClose }: { ticketId: number; onClose: () => void }) {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const queryClient = useQueryClient()
  const [reply, setReply] = useState('')
  const [replyError, setReplyError] = useState<string | null>(null)
  const replyRef = useRef<HTMLTextAreaElement>(null)

  const { data: ticket, isLoading, error } = useQuery({
    queryKey: ['support', 'ticket', ticketId],
    queryFn: () => fetchSupportTicket(ticketId),
  })
  const { data: replies = [] } = useQuery({
    queryKey: ['support', 'replies', ticketId],
    queryFn: () => fetchSupportReplies(ticketId),
    enabled: Boolean(ticket),
    refetchInterval: 60_000,
  })

  const isReporter = Boolean(ticket && user && ticket.user_id === user.id)
  const unseen = Boolean(ticket && isReporter && hasUnseenSupportActivity(ticket))
  useEffect(() => {
    if (!unseen) return
    markSupportTicketSeen(ticketId)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['support', 'badge'] })
        queryClient.invalidateQueries({ queryKey: ['support', 'page'] })
      })
      .catch(() => {})
  }, [unseen, ticketId, queryClient])

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['support'] })

  const replyMutation = useMutation({
    mutationFn: () => {
      if (!user) throw new Error('Sign in again to reply.')
      return postSupportReply(ticketId, user.id, reply)
    },
    onSuccess: () => {
      setReply('')
      refresh()
    },
  })
  const statusMutation = useMutation({
    mutationFn: (status: SupportStatus) => setSupportTicketStatus(ticketId, status),
    onSuccess: refresh,
  })
  const deleteMutation = useMutation({
    mutationFn: () => deleteSupportTicket(ticketId),
    onSuccess: () => {
      refresh()
      onClose()
    },
  })

  if (isLoading) {
    return (
      <Modal title="Ticket" onClose={onClose} maxWidthClassName="max-w-2xl">
        <p className="py-6 text-center text-sm text-gray-400">Loading...</p>
      </Modal>
    )
  }
  if (!ticket) {
    return (
      <Modal title="Ticket" onClose={onClose}>
        <p className="py-4 text-sm text-gray-600">{error ? errorMessage(error, "This ticket couldn't be loaded.") : "This ticket doesn't exist, or isn't one you can see."}</p>
      </Modal>
    )
  }

  const withdrawing = isReporter && !isAdmin
  const canDelete = isAdmin || (isReporter && ticket.status === 'open')
  const KindIcon = KIND_ICONS[ticket.kind]

  const sendReply = (e: FormEvent) => {
    e.preventDefault()
    if (replyMutation.isPending) return
    if (!reply.trim()) {
      setReplyError('Write a reply first.')
      replyRef.current?.focus()
      return
    }
    setReplyError(null)
    replyMutation.mutate()
  }

  return (
    <Modal title={ticket.title} onClose={onClose} maxWidthClassName="max-w-2xl">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-sm text-gray-600">
          <KindIcon className="h-4 w-4 text-gray-400" aria-hidden />
          {SUPPORT_KIND_LABELS[ticket.kind]}
        </span>
        {isAdmin ? (
          <Select
            aria-label="Status"
            value={ticket.status}
            onChange={(value) => statusMutation.mutate(value as SupportStatus)}
            options={SUPPORT_STATUSES.map((status) => ({ value: status, label: SUPPORT_STATUS_LABELS[status] }))}
            className={`${pillClass} ${STATUS_STYLES[ticket.status]}`}
          />
        ) : (
          <span className={`${pillClass} ${STATUS_STYLES[ticket.status]}`}>{SUPPORT_STATUS_LABELS[ticket.status]}</span>
        )}
        <span className="ml-auto text-xs text-gray-400">#{ticket.id}</span>
      </div>

      <FormattedText text={ticket.body} className="text-sm text-gray-800" />

      {ticket.screenshot_refs.length > 0 && (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {ticket.screenshot_refs.map((ref) => (
            <Screenshot key={ref} refId={ref} />
          ))}
        </div>
      )}

      <dl className="mt-4">
        {isAdmin && (
          <Detail label="Reported by">
            {ticket.reporter ? (
              <>
                <Link to={contributorPath(ticket.reporter.email)} className="font-medium text-sky-700 hover:underline">
                  {ticket.reporter.name}
                </Link>
                <span className="text-xs capitalize text-gray-400"> · {ticket.reporter.role}</span>
              </>
            ) : (
              '—'
            )}
          </Detail>
        )}
        <Detail label="Reported">{new Date(ticket.created_at).toLocaleString()}</Detail>
        {ticket.page && (
          <Detail label="Page">
            <span className="font-mono text-xs">{ticket.page}</span>
          </Detail>
        )}
        {isAdmin && (
          <Detail label="Device">
            <span className="text-xs text-gray-500">
              v{ticket.app_version ?? '?'} · {ticket.user_agent ?? 'Unknown browser'}
            </span>
          </Detail>
        )}
      </dl>

      {statusMutation.isError && <div className="mt-2 text-sm text-status-danger-text">{errorMessage(statusMutation.error, "Couldn't change the status.")}</div>}

      <section className="mt-5 border-t border-gray-100 pt-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Replies</h3>
        {replies.length === 0 && (
          <p className="mb-3 text-sm text-gray-400">{isAdmin ? 'No replies yet.' : "No replies yet. You'll see a dot on Support when there is one."}</p>
        )}
        <ol className="mb-3 flex flex-col gap-3">
          {replies.map((r) => {
            const fromSupport = r.user_id !== ticket.user_id
            return (
              <li key={r.id} className="flex gap-3">
                <Avatar name={r.author?.name ?? '?'} size={28} />
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-gray-500">
                    <span className="font-medium text-gray-800">{r.author?.name ?? 'Someone'}</span>
                    {fromSupport && <span className="ml-1.5 rounded-full bg-accent-bg px-1.5 py-px text-[10px] font-semibold text-accent-on-bg">Support</span>}
                    <span className="ml-1.5">{timeAgo(r.created_at)}</span>
                  </div>
                  <FormattedText text={r.body} className="mt-0.5 text-sm text-gray-800" />
                </div>
              </li>
            )
          })}
        </ol>
        <form onSubmit={sendReply} noValidate className="flex flex-col gap-2">
          <textarea
            ref={replyRef}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) sendReply(e)
            }}
            maxLength={5000}
            rows={3}
            aria-label="Reply"
            placeholder={isAdmin && !isReporter ? 'Reply to the reporter...' : 'Add more detail or reply...'}
            className={inputClass}
          />
          {(replyError || replyMutation.isError) && (
            <div role="alert" className="text-sm text-status-danger-text">
              {replyError ?? errorMessage(replyMutation.error, "Couldn't send your reply.")}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {canDelete && (
              <button
                type="button"
                onClick={async () => {
                  const ok = withdrawing
                    ? await confirmDialog('Withdraw this report? It will be removed.', { confirmLabel: 'Withdraw' })
                    : await confirmDialog('Delete this ticket and its replies? This cannot be undone.', { confirmLabel: 'Delete', danger: true })
                  if (ok) deleteMutation.mutate()
                }}
                className={`mr-auto ${secondaryButton}`}
              >
                {withdrawing ? <Undo2 className="h-3.5 w-3.5" aria-hidden /> : <Trash2 className="h-3.5 w-3.5" aria-hidden />}
                {withdrawing ? 'Withdraw' : 'Delete'}
              </button>
            )}
            <span className="ml-auto hidden text-xs text-gray-400 sm:inline">⌘/Ctrl Enter</span>
            <button
              type="submit"
              aria-busy={replyMutation.isPending || undefined}
              className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
            >
              <Send className="h-4 w-4" aria-hidden />
              {replyMutation.isPending ? 'Sending...' : 'Reply'}
            </button>
          </div>
          {deleteMutation.isError && <div className="text-sm text-status-danger-text">{errorMessage(deleteMutation.error, "Couldn't delete this ticket.")}</div>}
        </form>
      </section>
    </Modal>
  )
}

function Screenshot({ refId }: { refId: string }) {
  const { data: url, error } = useQuery({
    queryKey: ['support', 'screenshot', refId],
    queryFn: async () => URL.createObjectURL(await fetchSupportScreenshot(refId)),
    staleTime: Infinity,
    gcTime: 10 * 60_000,
  })
  if (error) {
    return <div className="flex aspect-video items-center justify-center rounded-lg border border-gray-200 p-2 text-center text-xs text-gray-400">{errorMessage(error, "Couldn't load")}</div>
  }
  if (!url) return <div className="aspect-video animate-pulse rounded-lg bg-gray-100" />
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg border border-gray-200">
      <img src={url} alt="Screenshot" className="aspect-video w-full object-cover object-top" />
    </a>
  )
}
