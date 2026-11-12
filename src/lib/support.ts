import { sanitiseOrTerm } from './sanitiseOrTerm'
import { supabase } from './api'

export type SupportKind = 'bug' | 'feature'
export type SupportStatus = 'open' | 'in_progress' | 'done' | 'wont_do'

export const SUPPORT_KIND_LABELS: Record<SupportKind, string> = { bug: 'Bug', feature: 'Feature request' }
export const SUPPORT_STATUS_LABELS: Record<SupportStatus, string> = {
  open: 'New',
  in_progress: 'In progress',
  done: 'Done',
  wont_do: "Won't do",
}
export const SUPPORT_STATUSES: SupportStatus[] = ['open', 'in_progress', 'done', 'wont_do']
export const MAX_SUPPORT_SCREENSHOTS = 3

export interface SupportTicket {
  id: number
  user_id: string
  kind: SupportKind
  title: string
  body: string
  page: string | null
  app_version: string | null
  user_agent: string | null
  screenshot_refs: string[]
  status: SupportStatus
  status_changed_at: string | null
  support_activity_at: string | null
  reporter_seen_at: string
  created_at: string
  updated_at: string
  reporter: { id: string; name: string; email: string; role: string } | null
}

export interface SupportReply {
  id: number
  ticket_id: number
  user_id: string | null
  body: string
  created_at: string
  author: { id: string; name: string; role: string } | null
}

const TICKET_SELECT = '*, reporter:profiles!support_tickets_user_id_fkey(id, name, email, role)'

export function hasUnseenSupportActivity(ticket: Pick<SupportTicket, 'support_activity_at' | 'reporter_seen_at'>): boolean {
  return Boolean(ticket.support_activity_at && ticket.support_activity_at > ticket.reporter_seen_at)
}

// A search matches the title, or (for an admin) the reporter's name or email.
// (Returns the filter, not the query: awaiting a Supabase query would run it.)
async function searchFilter(search: string): Promise<string | null> {
  const term = sanitiseOrTerm(search.trim())
  if (!term) return null
  const asId = /^#?\d+$/.test(term) ? `,id.eq.${term.replace('#', '')}` : ''
  const { data: people } = await supabase.from('profiles').select('id').or(`name.ilike.%${term}%,email.ilike.%${term}%`).limit(200)
  const ids = (people ?? []).map((p) => p.id as string)
  return `title.ilike.%${term}%${asId}${ids.length ? `,user_id.in.(${ids.join(',')})` : ''}`
}

export interface SupportFilters {
  status: SupportStatus | 'all' | 'active'
  kind: SupportKind | 'all'
  search: string
}

interface Filterable {
  eq(column: string, value: string): Filterable
  in(column: string, values: string[]): Filterable
  or(filter: string): Filterable
}

// Typed structurally: Supabase's own builder types are too deep for TypeScript to follow generically.
function applyFilters<T>(builder: T, filters: Omit<SupportFilters, 'search'>, search: string | null): T {
  let query = builder as unknown as Filterable
  if (filters.status === 'active') query = query.in('status', ['open', 'in_progress'])
  else if (filters.status !== 'all') query = query.eq('status', filters.status)
  if (filters.kind !== 'all') query = query.eq('kind', filters.kind)
  if (search) query = query.or(search)
  return query as unknown as T
}

/** One page of the tickets the caller can see (their own; an admin, everyone's), newest activity first. */
export async function fetchSupportTicketsPage(
  params: SupportFilters & { page: number; pageSize: number },
): Promise<{ rows: SupportTicket[]; total: number }> {
  const search = await searchFilter(params.search)
  const query = applyFilters(supabase.from('support_tickets').select(TICKET_SELECT, { count: 'exact' }), params, search)
  const from = (params.page - 1) * params.pageSize
  const { data, error, count } = await query
    .order('updated_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, from + params.pageSize - 1)
  if (error) throw error
  return { rows: data as SupportTicket[], total: count ?? 0 }
}

/** Tickets in each status tab for these filters, counted without downloading them. */
export async function fetchSupportStatusCounts(
  kind: SupportKind | 'all',
  searchText: string,
): Promise<Record<SupportFilters['status'], number>> {
  const search = await searchFilter(searchText)
  const tabs: SupportFilters['status'][] = ['active', 'open', 'in_progress', 'done', 'wont_do', 'all']
  const counts = await Promise.all(
    tabs.map(async (status) => {
      const query = applyFilters(supabase.from('support_tickets').select('id', { count: 'exact', head: true }), { status, kind }, search)
      const { count, error } = await query
      if (error) throw error
      return count ?? 0
    }),
  )
  return Object.fromEntries(tabs.map((tab, i) => [tab, counts[i]])) as Record<SupportFilters['status'], number>
}

export async function fetchSupportTicket(id: number): Promise<SupportTicket | null> {
  const { data, error } = await supabase.from('support_tickets').select(TICKET_SELECT).eq('id', id).maybeSingle()
  if (error) throw error
  return data as SupportTicket | null
}

/** The number on the Support link (see support_badge_count()). */
export async function fetchSupportBadgeCount(): Promise<number> {
  const { data, error } = await supabase.rpc('support_badge_count')
  if (error) throw error
  return typeof data === 'number' ? data : 0
}

export async function fileSupportTicket(params: {
  userId: string
  kind: SupportKind
  title: string
  body: string
  page: string | null
  appVersion: string
  screenshotRefs: string[]
}): Promise<number> {
  const { data, error } = await supabase
    .from('support_tickets')
    .insert({
      user_id: params.userId,
      kind: params.kind,
      title: params.title.trim(),
      body: params.body.trim(),
      page: params.page?.slice(0, 300) || null,
      app_version: params.appVersion.slice(0, 40),
      user_agent: navigator.userAgent.slice(0, 500),
      screenshot_refs: params.screenshotRefs.slice(0, MAX_SUPPORT_SCREENSHOTS),
    })
    .select('id')
    .single()
  if (error) throw error
  return (data as { id: number }).id
}

export async function fetchSupportReplies(ticketId: number): Promise<SupportReply[]> {
  const { data, error } = await supabase
    .from('support_ticket_replies')
    .select('*, author:profiles!support_ticket_replies_user_id_fkey(id, name, role)')
    .eq('ticket_id', ticketId)
    .order('created_at')
    .order('id')
  if (error) throw error
  return data as SupportReply[]
}

export async function postSupportReply(ticketId: number, userId: string, body: string): Promise<void> {
  const { error } = await supabase.from('support_ticket_replies').insert({ ticket_id: ticketId, user_id: userId, body: body.trim() })
  if (error) throw error
}

/** Admins only; the database refuses anyone else. */
export async function setSupportTicketStatus(id: number, status: SupportStatus): Promise<void> {
  const { error } = await supabase.rpc('set_support_ticket_status', { p_id: id, p_status: status })
  if (error) throw error
}

export async function markSupportTicketSeen(id: number): Promise<void> {
  const { error } = await supabase.rpc('mark_support_ticket_seen', { p_id: id })
  if (error) throw error
}

/** The reporter withdraws their own open ticket; an admin deletes any. */
export async function deleteSupportTicket(id: number): Promise<void> {
  const { error } = await supabase.from('support_tickets').delete().eq('id', id)
  if (error) throw error
}

// Screenshots go to Google Drive through api/support-screenshot (see supportScreenshotGate.ts).
const SCREENSHOT_ENDPOINT = '/api/support-screenshot'
const MAX_EDGE = 1920
const MAX_BYTES = 1500 * 1024

async function accessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Sign in again to add a screenshot.')
  return token
}

/** Any picked or pasted image, shrunk to fit MAX_EDGE and re-encoded as a JPEG under MAX_BYTES. */
export async function screenshotToJpeg(file: Blob): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('That file is not an image.')
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('That image could not be read. Try another one.')
  })
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('That image could not be read. Try another one.')
  context.fillStyle = '#fff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  for (const quality of [0.85, 0.7, 0.55, 0.4]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (blob && blob.size <= MAX_BYTES) return blob
  }
  throw new Error('That screenshot is too large. Try a smaller one.')
}

/** Uploads a JPEG, reporting progress (0–1), and returns the ref to file the ticket with. */
export async function uploadSupportScreenshot(jpeg: Blob, onProgress: (fraction: number) => void): Promise<string> {
  const token = await accessToken()
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', SCREENSHOT_ENDPOINT)
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.setRequestHeader('Content-Type', 'image/jpeg')
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total)
    xhr.onerror = () => reject(new Error("Your screenshot couldn't be sent. Check your connection and try again."))
    xhr.onload = () => {
      let body: { ref?: string; message?: string } | null = null
      try {
        body = JSON.parse(xhr.responseText)
      } catch {
        body = null
      }
      if (xhr.status >= 200 && xhr.status < 300 && body?.ref) resolve(body.ref)
      else reject(new Error(body?.message || "Your screenshot couldn't be saved. Please try again."))
    }
    xhr.send(jpeg)
  })
}

export async function fetchSupportScreenshot(ref: string): Promise<Blob> {
  const response = await fetch(`${SCREENSHOT_ENDPOINT}?ref=${encodeURIComponent(ref)}`, {
    headers: { Authorization: `Bearer ${await accessToken()}` },
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null
    throw new Error(body?.message || "This screenshot couldn't be loaded.")
  }
  return response.blob()
}
