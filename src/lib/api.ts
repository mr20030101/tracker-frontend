import { createClient } from '@supabase/supabase-js'
import { DEFAULT_WEEKLY_TARGET, WEEK_LENGTH_DAYS } from './week'
import { DEFAULT_SUPABASE_ANON_KEY, DEFAULT_SUPABASE_URL } from './supabaseConfig'
import type { ActivityEvent, ActivityLog, ContributorProfile, DashboardSummary, DailyReportRow, LeaderboardRow, Paginated, Project, ProjectBreakdown, ProjectLevel, ProjectReportRow, Resource, Stage, TaskSubmission, User } from '../types'
import { fetchAllPages } from './fetchAll'
import { sanitiseOrTerm } from './sanitiseOrTerm'
import { WORKING_DAYS, fetchDailyQuotas, fetchWeeklyTargets } from './quotas'
import { dailyHoursFor, hoursRendered } from './hoursTarget'
import { assignedProjectIds, fetchAssignments } from './cbProjects'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() || DEFAULT_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || DEFAULT_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

type Response<T> = { data: T }

// A caught error isn't always an Error instance (a plain object with a `message`, a string, etc.),
// so `err instanceof Error ? err.message : fallback` silently drops the real reason in those
// cases. This pulls `.message` off anything error-shaped before giving up and using the fallback.
export function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message
  }
  return fallback
}

export function taskIdConflictError(table: string, error: { code?: string; message: string }): Error {
  if (table === 'task_submissions' && error.code === '23505' && error.message.includes('task_id')) {
    return new Error('This Task ID is already logged for this person. Double check your Task ID.')
  }
  return error as Error
}

export async function functionErrorMessage(error: { message: string; context?: globalThis.Response }): Promise<Error> {
  if (error.context) {
    try {
      const body = await error.context.clone().json()
      if (body?.error) return new Error(body.error)
    } catch {
      // Fall back to the SDK error when the function response is not JSON.
    }
  }
  return new Error(error.message)
}

async function result<T>(query: PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<Response<T[]>> {
  const { data, error } = await query
  if (error) throw error
  return { data: data ?? [] }
}

// The signed-in user's id from the session kept in the browser. getUser() would ask the auth server
// on every call, a round trip before each request; the database checks the token itself anyway.
async function sessionUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

async function currentProfile(): Promise<User> {
  const userId = await sessionUserId()
  if (!userId) throw new Error('Unauthenticated')
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
  // As an Error, so a lost connection ("Failed to fetch") is recognised and the submission queued.
  if (error) throw new Error(error.message)
  // Every login gets a profile from the handle_new_user() trigger, filled in by manage-user; one
  // without it (or not yet activated) has no business in the app.
  if (!data || !data.is_active) throw new Error('Account disabled')
  return data as User
}

function withProject<T extends { project_id: number | null }>(rows: T[], projects: Project[]) {
  return rows.map((row) => ({ ...row, project: projects.find((project) => project.id === row.project_id) ?? null }))
}

async function projects(): Promise<Project[]> {
  const { data } = await result(supabase.from('projects').select('*').order('name'))
  return data as Project[]
}

const SORTABLE_COLUMNS = new Set(['cb_email', 'task_id', 'stage', 'status', 'date', 'project_id'])

/** The ids of a lead's contributors (an empty team matches nothing). */
export async function teamMemberIds(leadId: string): Promise<string[]> {
  const { data, error } = await supabase.from('profiles').select('id').eq('lead_id', leadId)
  if (error) throw error
  const ids = (data ?? []).map((row) => row.id as string)
  return ids.length > 0 ? ids : ['00000000-0000-0000-0000-000000000000']
}

async function submissions(params: Record<string, unknown> = {}): Promise<Paginated<TaskSubmission>> {
  const profile = await currentProfile()
  const sortColumn = typeof params.sort === 'string' && SORTABLE_COLUMNS.has(params.sort) ? params.sort : 'date'
  const sortAscending = params.sort_dir === 'asc'
  let query = supabase.from('task_submissions').select('*', { count: 'exact' }).order(sortColumn, { ascending: sortAscending }).order('id', { ascending: sortAscending })
  if (profile.role === 'contributor') query = query.eq('user_id', profile.id)
  if (params.stage) query = query.eq('stage', params.stage)
  if (params.search) {
    const term = sanitiseOrTerm(String(params.search))
    query = query.or(`cb_email.ilike.%${term}%,task_id.ilike.%${term}%`)
  }
  if (params.date_from) query = query.gte('date', params.date_from)
  if (params.date_to) query = query.lte('date', params.date_to)
  if (params.status) query = query.eq('status', params.status)
  if (params.project_id) query = query.eq('project_id', Number(params.project_id))
  // One lead's team: their contributors' tasks.
  if (params.lead_id) query = query.in('user_id', await teamMemberIds(String(params.lead_id)))
  const page = Number(params.page ?? 1)
  const from = (page - 1) * 25
  const to = from + 24
  const { data, error, count } = await query.range(from, to)
  if (error) throw error
  const rows = withProject((data ?? []) as TaskSubmission[], await projects())
  const total = count ?? rows.length
  return { data: rows, current_page: page, last_page: Math.max(1, Math.ceil(total / 25)), total, from: total ? from + 1 : null, to: total ? Math.min(to + 1, total) : null }
}

// The weekly target is daily quotas times 5 working days, independent of the 7-day week span.
const TARGET_MULTIPLIER: Record<string, number> = { day: 1 / 5, week: 1, month: 4 }

async function dashboard(params: Record<string, unknown>): Promise<DashboardSummary> {
  const rangeStart = String(params.range_start ?? params.week_start)
  const rangeEnd = String(
    params.range_end ??
      (() => {
        const d = new Date(`${rangeStart}T00:00:00Z`)
        d.setUTCDate(d.getUTCDate() + WEEK_LENGTH_DAYS - 1)
        return d.toISOString().slice(0, 10)
      })(),
  )
  const view = typeof params.view === 'string' ? params.view : 'week'
  const multiplier = TARGET_MULTIPLIER[view] ?? 1
  // Weekly targets are keyed by the week's Tuesday (see startOfWeek in lib/week.ts,
  // which this mirrors in UTC); use the week containing the range's start as the basis.
  const targetWeekStart = new Date(`${rangeStart}T00:00:00Z`)
  targetWeekStart.setUTCDate(targetWeekStart.getUTCDate() - ((targetWeekStart.getUTCDay() - 2 + 7) % 7))
  const targetWeekStartIso = targetWeekStart.toISOString().slice(0, 10)

  const [{ data: users }, { data: submissions }, targetByUser, projectList, { data: projectLeads }, assignments] = await Promise.all([
    supabase.from('profiles').select('*').eq('role', 'contributor').order('name'),
    // Paged: a month of submissions is well over the 1,000 rows one request returns (see fetchAll).
    fetchAllPages<{
      user_id: string | null
      cb_email: string | null
      project_id: number | null
      status: string
      date: string | null
      timer_elapsed_seconds: number | null
      timer_started_at: string | null
    }>(
      (from, to) =>
        supabase
          .from('task_submissions')
          .select('user_id, cb_email, project_id, status, date, timer_elapsed_seconds, timer_started_at')
          .gte('date', rangeStart)
          .lte('date', rangeEnd)
          .order('id')
          .range(from, to),
    ).then((data) => ({ data })),
    fetchWeeklyTargets(targetWeekStartIso),
    projects(),
    supabase.from('project_leads').select('project_id, lead_id'),
    fetchAssignments(),
  ])
  const projectId = params.project_id ? Number(params.project_id) : null
  // On one project, the target is that project's daily quota for each person's level there.
  const projectQuotaByUser = projectId
    ? new Map((await fetchDailyQuotas()).filter((q) => q.project_id === projectId).map((q) => [q.user_id, q.daily_quota * WORKING_DAYS]))
    : null
  const filteredSubmissions = (submissions ?? []).filter((submission) => !projectId || submission.project_id === projectId)
  // Filtered to a project: only the contributors on it (assigned, see lib/cbProjects.ts), and anyone
  // who logged on it in the range anyway, so their work isn't hidden.
  const onProject = (user: { id: string; email: string; lead_id?: string | null }) =>
    !projectId ||
    assignedProjectIds(user.id, user.lead_id ?? null, projectLeads ?? [], assignments).includes(projectId) ||
    filteredSubmissions.some((s) => s.user_id === user.id || s.cb_email?.toLowerCase() === user.email.toLowerCase())
  const rows = (users ?? []).filter(onProject).map((user) => {
    const entries = filteredSubmissions.filter(
      (submission) =>
        (submission.user_id === user.id || submission.cb_email?.toLowerCase() === user.email.toLowerCase()) &&
        (!projectId || submission.project_id === projectId),
    )
    const submitted = entries.filter((entry) => entry.status === 'submitted').length
    const baseTarget = projectQuotaByUser?.get(user.id) ?? targetByUser.get(user.id) ?? DEFAULT_WEEKLY_TARGET
    const target = Math.round(baseTarget * multiplier)
    // Hours: the time on their task timers in the range, against Hours / day on their projects
    // (just the chosen project's when filtered) times the working days in the view.
    const rendered = hoursRendered(entries.map((entry) => ({ timer_elapsed_seconds: entry.timer_elapsed_seconds ?? 0, timer_started_at: entry.timer_started_at })))
    const dailyHours = projectId
      ? Number((projectList ?? []).find((project) => project.id === projectId)?.daily_hours ?? 0)
      : dailyHoursFor(user.id, user.lead_id ?? null, projectList ?? [], projectLeads ?? [], assignments)
    const hoursTarget = dailyHours * WORKING_DAYS * multiplier
    return {
      user_id: user.id,
      cb_email: user.email,
      name: user.name,
      lead_id: user.lead_id ?? null,
      is_active: user.is_active,
      tasks_submitted: submitted,
      weekly_target: target,
      progress: target ? submitted / target : 0,
      hours_rendered: rendered,
      hours_target: hoursTarget,
      hours_progress: hoursTarget ? rendered / hoursTarget : 0,
    }
  })
  // Match submissions to active contributors by email only — mixing user_id and
  // cb_email as the same identity key in one Set let a contributor with both kinds
  // of rows (or an unmatched email) inflate the distinct-submitter count, silently
  // under-reporting contributors_without_submissions.
  const activeContributorEmails = new Set(
    (users ?? []).filter((user) => user.is_active && onProject(user)).map((user) => user.email.toLowerCase()),
  )

  const dailyReport: DailyReportRow[] = []
  const day = new Date(`${rangeStart}T00:00:00Z`)
  const endTime = new Date(`${rangeEnd}T00:00:00Z`).getTime()
  while (day.getTime() <= endTime) {
    const date = day.toISOString().slice(0, 10)
    const dayEntries = filteredSubmissions.filter((submission) => submission.date?.slice(0, 10) === date)
    const submittingContributors = new Set(
      dayEntries
        .filter((entry) => entry.status === 'submitted')
        .map((entry) => entry.cb_email?.toLowerCase())
        .filter((email): email is string => Boolean(email) && activeContributorEmails.has(email)),
    )
    dailyReport.push({
      date,
      tasks_submitted: dayEntries.filter((entry) => entry.status === 'submitted').length,
      tasks_logged: dayEntries.length,
      contributors_submitted: submittingContributors.size,
      contributors_without_submissions: Math.max(0, activeContributorEmails.size - submittingContributors.size),
    })
    day.setUTCDate(day.getUTCDate() + 1)
  }
  const byProject = new Map<number | null, ProjectReportRow & { submitters: Set<string> }>()
  for (const submission of filteredSubmissions) {
    const key = submission.project_id ?? null
    const entry = byProject.get(key) ?? {
      project_id: key,
      name: projectList.find((project) => project.id === key)?.name ?? 'Unassigned',
      tasks_submitted: 0,
      tasks_logged: 0,
      contributors_submitted: 0,
      submitters: new Set<string>(),
    }
    entry.tasks_logged += 1
    if (submission.status === 'submitted') {
      entry.tasks_submitted += 1
      if (submission.cb_email) entry.submitters.add(submission.cb_email.toLowerCase())
    }
    byProject.set(key, entry)
  }
  const projectReport: ProjectReportRow[] = [...byProject.values()]
    .map(({ submitters, ...row }) => ({ ...row, contributors_submitted: submitters.size }))
    .sort((a, b) => b.tasks_submitted - a.tasks_submitted)

  return { week_start: rangeStart, week_end: rangeEnd, data: rows, daily_report: dailyReport, project_report: projectReport }
}

// Looked up by `id` when the caller doesn't know the person's email (a contributor opening a peer's
// profile), otherwise by `email`.
async function contributor(params: Record<string, unknown>): Promise<ContributorProfile> {
  const targetId = params.id ? String(params.id) : null
  const weekStart = String(params.week_start)
  const weekEndDate = new Date(`${weekStart}T00:00:00Z`)
  weekEndDate.setUTCDate(weekEndDate.getUTCDate() + WEEK_LENGTH_DAYS - 1)
  const weekEnd = weekEndDate.toISOString().slice(0, 10)
  const { data: user } = targetId
    ? await supabase.from('profiles').select('*').eq('id', targetId).maybeSingle()
    : await supabase.from('profiles').select('*').eq('email', String(params.email)).maybeSingle()
  const email: string = user?.email ?? (targetId ? '' : String(params.email))

  if (!user) {
    // RLS only lets self, the contributor's lead, or an admin read their
    // profiles/task_submissions rows directly — a peer contributor viewing
    // someone else falls back to this security-definer RPC, which exposes
    // rollups only (never raw task IDs, links, or per-row status).
    const { data: rows, error } = targetId
      ? await supabase.rpc('contributor_public_stats_by_id', { p_target_id: targetId, p_week_start: weekStart })
      : await supabase.rpc('contributor_public_stats', { p_target_email: email, p_week_start: weekStart })
    if (error) throw error
    const stats = rows?.[0]
    const publicUser: User | null = stats
      ? {
          id: stats.id,
          name: stats.name,
          email,
          role: stats.role as User['role'],
          shift: stats.shift,
          meet_link: null,
          is_active: stats.is_active,
          last_seen_at: null,
          lead_id: stats.lead_id,
          avatar_url: stats.avatar_url,
          must_change_password: false,
          accepting_applications: true,
          // Not exposed by this public-view RPC — only meaningful for the caller's own team.
          remotasks_id: null,
          bio: stats.bio,
        }
      : null
    return {
      user: publicUser,
      cb_email: email,
      week_start: weekStart,
      week_end: weekEnd,
      weekly_target: stats?.weekly_target ?? DEFAULT_WEEKLY_TARGET,
      submitted_this_week: Number(stats?.submitted_this_week ?? 0),
      total_submitted: 0,
      total_logged: 0,
      stage_breakdown: (stats?.stage_breakdown ?? {}) as Partial<Record<Stage, number>>,
      project_breakdown: (stats?.project_breakdown ?? []) as ProjectBreakdown[],
      week_submissions: [],
      recent_submissions: [],
      all_submissions: [],
      submission_trend: (stats?.trend ?? []) as { date: string; value: number }[],
      project_levels: (stats?.levels ?? []) as { project_id: number; level: ProjectLevel }[],
      is_public_view: true,
    }
  }

  // Case-insensitive, like the dashboard, leaderboard and rewards: a row logged as "Jane.Doe@…" for
  // jane.doe@… counts there, so it has to count here too. ilike needs LIKE's _ and % escaped.
  const emailPattern = email.replace(/[\\%_]/g, (char) => `\\${char}`)
  // `week_only`: just the week's rows (the contributor's own Dashboard needs nothing older), one
  // small request instead of their whole history.
  // `date_from` / `date_to`: just the rows in that span (a profile's chosen period plus the last 30
  // days for its trend and CTS form), with the all-time totals counted on the server instead.
  const weekOnly = Boolean(params.week_only)
  const dateFrom = weekOnly ? weekStart : typeof params.date_from === 'string' ? params.date_from : null
  const dateTo = typeof params.date_to === 'string' ? params.date_to : null
  const countTotal = async (submittedOnly: boolean) => {
    let query = supabase.from('task_submissions').select('id', { count: 'exact', head: true }).ilike('cb_email', emailPattern)
    if (submittedOnly) query = query.eq('status', 'submitted')
    const { count } = await query
    return count ?? 0
  }
  const [{ data: rows }, targetByUser, totals] = await Promise.all([
    // Paged: one contributor's whole history can pass 1,000 rows.
    fetchAllPages<TaskSubmission>((from, to) => {
      let query = supabase.from('task_submissions').select('*').ilike('cb_email', emailPattern)
      if (dateFrom) query = query.gte('date', dateFrom)
      if (dateTo) query = query.lte('date', dateTo)
      return query.order('date', { ascending: false }).order('id').range(from, to)
    }).then((data) => ({ data })),
    user ? fetchWeeklyTargets(weekStart, [user.id]) : new Map<string, number>(),
    dateFrom ? Promise.all([countTotal(true), countTotal(false)]) : Promise.resolve(null),
  ])
  const submissions = withProject((rows ?? []) as TaskSubmission[], await projects())
  const weekRows = submissions.filter((row) => row.date && row.date >= weekStart && row.date <= weekEnd)
  const stageBreakdown = submissions.reduce<Record<string, number>>((counts, row) => ({ ...counts, [row.stage]: (counts[row.stage] ?? 0) + 1 }), {})
  const projectBreakdown = submissions.reduce<Record<string, number>>((counts, row) => {
    const name = row.project?.name ?? 'Unassigned'
    return { ...counts, [name]: (counts[name] ?? 0) + 1 }
  }, {})
  return { user: user as User | null, cb_email: email, week_start: weekStart, week_end: weekEnd, weekly_target: (user && targetByUser.get(user.id)) ?? DEFAULT_WEEKLY_TARGET, submitted_this_week: weekRows.filter((row) => row.status === 'submitted').length, total_submitted: totals ? totals[0] : submissions.filter((row) => row.status === 'submitted').length, total_logged: totals ? totals[1] : submissions.length, stage_breakdown: stageBreakdown, project_breakdown: Object.entries(projectBreakdown).map(([name, total]) => ({ name, total })), week_submissions: weekRows, recent_submissions: submissions.slice(0, 10), all_submissions: submissions, is_public_view: false }
}

async function leaderboard(params: Record<string, unknown>): Promise<LeaderboardRow[]> {
  const { data, error } = await supabase.rpc('leaderboard', {
    range_start: String(params.range_start),
    range_end: String(params.range_end),
  })
  if (error) throw error
  return (data ?? []) as LeaderboardRow[]
}

async function listResources(): Promise<Resource[]> {
  const { data } = await result(supabase.from('resources').select('*').order('sort_order'))
  return withProject(data as Resource[], await projects()) as Resource[]
}

async function activityLogs(): Promise<ActivityLog[]> {
  await currentProfile()
  const { data, error } = await supabase
    .from('activity_logs')
    .select('*, user:profiles(id, name, email)')
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw error
  return data as ActivityLog[]
}

// Fire-and-forget: auth events are logged best-effort and should never block
// the login/logout flow they describe.
export function logActivity(event: ActivityEvent, userId: string | null, email?: string) {
  supabase
    .from('activity_logs')
    .insert({ event, user_id: userId, email: email ?? null, user_agent: navigator.userAgent })
    .then(({ error }) => {
      if (error) console.warn('Could not record activity log:', error.message)
    })
}

/** Resolves false only once this sign-in has been signed out by an admin; any error counts as still signed in. */
export async function touchPresence(device: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('touch_presence', { p_device: device })
  if (error) {
    console.warn('Could not update presence:', error.message)
    return true
  }
  return data !== false
}

export const api = {
  async get<T>(path: string, options?: { params?: Record<string, unknown> }): Promise<Response<T>> {
    const params = options?.params ?? {}
    if (path === '/me') return { data: { user: await currentProfile() } as T }
    if (path === '/projects') return { data: (await projects()) as T }
    if (path === '/resources') return { data: (await listResources()) as T }
    if (path === '/users') {
      await currentProfile()
      const { data } = await result(supabase.from('profiles').select('*').order('name'))
      return { data: data as T }
    }
    if (path === '/task-submissions') return { data: (await submissions(params)) as T }
    if (path === '/dashboard/summary') return { data: (await dashboard(params)) as T }
    if (path === '/leaderboard') return { data: (await leaderboard(params)) as T }
    if (path === '/contributor') return { data: (await contributor(params)) as T }
    if (path === '/activity-logs') return { data: (await activityLogs()) as T }
    throw new Error(`Unsupported GET endpoint: ${path}`)
  },
  async post<T>(path: string, payload: Record<string, unknown>): Promise<Response<T>> {
    const me = await currentProfile()
    if (path === '/users') {
      const { data, error } = await supabase.functions.invoke('manage-user', { body: payload })
      if (error) throw await functionErrorMessage(error)
      return { data: data as T }
    }
    const table = path.slice(1).replace('task-submissions', 'task_submissions')
    const row = path === '/task-submissions' ? { ...payload, user_id: me.id } : payload
    const { data, error } = await supabase.from(table).insert(row).select().single()
    if (error) throw taskIdConflictError(table, error)
    return { data: data as T }
  },
  async patch<T>(path: string, payload: Record<string, unknown>): Promise<Response<T>> {
    await currentProfile()
    const [, resource, id] = path.split('/')
    if (resource === 'users' && payload.password) {
      const { data, error } = await supabase.functions.invoke('manage-user', { body: { id, ...payload } })
      if (error) throw await functionErrorMessage(error)
      return { data: data as T }
    }
    const table = resource === 'users' ? 'profiles' : resource.replace('task-submissions', 'task_submissions')
    const { data, error } = await supabase.from(table).update(payload).eq('id', id).select().single()
    if (error) throw taskIdConflictError(table, error)
    return { data: data as T }
  },
  async delete(path: string): Promise<Response<null>> {
    await currentProfile()
    const [, resource, id] = path.split('/')
    if (resource === 'users') {
      const { error } = await supabase.functions.invoke('manage-user', { body: { action: 'delete-user', id } })
      if (error) throw await functionErrorMessage(error)
      return { data: null }
    }
    const table = resource.replace('task-submissions', 'task_submissions')
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) throw error
    return { data: null }
  },
}
