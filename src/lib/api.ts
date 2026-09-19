import { createClient } from '@supabase/supabase-js'
import type { ActivityEvent, ActivityLog, ContributorProfile, DashboardSummary, DailyReportRow, HouseRule, LeaderboardRow, Paginated, Project, ProjectBreakdown, ProjectLevel, Resource, Stage, TaskSubmission, User } from '../types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() || 'https://ieovepkcseytccagzedg.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imllb3ZlcGtjc2V5dGNjYWd6ZWRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkxNjU1NDUsImV4cCI6MjEwNDc0MTU0NX0.OMZEAONl3XoSwjb_RhYo70fYXThONXVBGQLlGF-OQ7s'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

type Response<T> = { data: T }

export function taskIdConflictError(table: string, error: { code?: string; message: string }): Error {
  if (table === 'task_submissions' && error.code === '23505' && error.message.includes('task_id')) {
    return new Error('This Task ID has already been logged. Double check your Task ID.')
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

async function currentProfile(): Promise<User> {
  const { data: authData } = await supabase.auth.getUser()
  if (!authData.user) throw new Error('Unauthenticated')
  const { data, error } = await supabase.from('profiles').select('*').eq('id', authData.user.id).maybeSingle()
  if (error) throw error
  if (!data) {
    const { data: created, error: createError } = await supabase
      .from('profiles')
      .insert({
        id: authData.user.id,
        name: authData.user.user_metadata.name ?? authData.user.email?.split('@')[0] ?? 'User',
        email: authData.user.email,
        role: 'contributor',
      })
      .select()
      .single()
    if (createError) throw createError
    return created as User
  }
  if (!data.is_active) throw new Error('Account disabled')
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

async function submissions(params: Record<string, unknown> = {}): Promise<Paginated<TaskSubmission>> {
  const profile = await currentProfile()
  const sortColumn = typeof params.sort === 'string' && SORTABLE_COLUMNS.has(params.sort) ? params.sort : 'date'
  const sortAscending = params.sort_dir === 'asc'
  let query = supabase.from('task_submissions').select('*', { count: 'exact' }).order(sortColumn, { ascending: sortAscending })
  if (profile.role === 'contributor') query = query.eq('user_id', profile.id)
  if (params.stage) query = query.eq('stage', params.stage)
  if (params.search) {
    const term = String(params.search).replace(/[%,]/g, '')
    query = query.or(`cb_email.ilike.%${term}%,task_id.ilike.%${term}%`)
  }
  if (params.date_from) query = query.gte('date', params.date_from)
  if (params.date_to) query = query.lte('date', params.date_to)
  const page = Number(params.page ?? 1)
  const from = (page - 1) * 25
  const to = from + 24
  const { data, error, count } = await query.range(from, to)
  if (error) throw error
  const rows = withProject((data ?? []) as TaskSubmission[], await projects())
  const total = count ?? rows.length
  return { data: rows, current_page: page, last_page: Math.max(1, Math.ceil(total / 25)), total, from: total ? from + 1 : null, to: total ? Math.min(to + 1, total) : null }
}

const TARGET_MULTIPLIER: Record<string, number> = { day: 1 / 5, week: 1, month: 4 }

async function dashboard(params: Record<string, unknown>): Promise<DashboardSummary> {
  const rangeStart = String(params.range_start ?? params.week_start)
  const rangeEnd = String(
    params.range_end ??
      (() => {
        const d = new Date(`${rangeStart}T00:00:00Z`)
        d.setUTCDate(d.getUTCDate() + 6)
        return d.toISOString().slice(0, 10)
      })(),
  )
  const view = typeof params.view === 'string' ? params.view : 'week'
  const multiplier = TARGET_MULTIPLIER[view] ?? 1
  // Weekly targets are configured per ISO week; use the week containing the range's start as the basis.
  const targetWeekStart = new Date(`${rangeStart}T00:00:00Z`)
  const isoDay = targetWeekStart.getUTCDay()
  targetWeekStart.setUTCDate(targetWeekStart.getUTCDate() - (isoDay === 0 ? 6 : isoDay - 1))
  const targetWeekStartIso = targetWeekStart.toISOString().slice(0, 10)

  const [{ data: users }, { data: submissions }, { data: targets }] = await Promise.all([
    supabase.from('profiles').select('*').eq('role', 'contributor').order('name'),
    supabase.from('task_submissions').select('user_id, cb_email, project_id, status, date').gte('date', rangeStart).lte('date', rangeEnd),
    supabase.from('weekly_targets').select('*').eq('week_start', targetWeekStartIso),
  ])
  const projectId = params.project_id ? Number(params.project_id) : null
  const filteredSubmissions = (submissions ?? []).filter((submission) => !projectId || submission.project_id === projectId)
  const rows = (users ?? []).map((user) => {
    const entries = filteredSubmissions.filter(
      (submission) =>
        (submission.user_id === user.id || submission.cb_email?.toLowerCase() === user.email.toLowerCase()) &&
        (!projectId || submission.project_id === projectId),
    )
    const submitted = entries.filter((entry) => entry.status === 'submitted').length
    const baseTarget = (targets ?? []).find((item) => item.user_id === user.id)?.target ?? 50
    const target = Math.round(baseTarget * multiplier)
    return { user_id: user.id, cb_email: user.email, name: user.name, is_active: user.is_active, tasks_submitted: submitted, weekly_target: target, progress: target ? submitted / target : 0 }
  })
  // Match submissions to active contributors by email only — mixing user_id and
  // cb_email as the same identity key in one Set let a contributor with both kinds
  // of rows (or an unmatched email) inflate the distinct-submitter count, silently
  // under-reporting contributors_without_submissions.
  const activeContributorEmails = new Set(
    (users ?? []).filter((user) => user.is_active).map((user) => user.email.toLowerCase()),
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
  return { week_start: rangeStart, week_end: rangeEnd, data: rows, daily_report: dailyReport }
}

async function contributor(params: Record<string, unknown>): Promise<ContributorProfile> {
  const email = String(params.email)
  const weekStart = String(params.week_start)
  const weekEndDate = new Date(`${weekStart}T00:00:00Z`)
  weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 6)
  const weekEnd = weekEndDate.toISOString().slice(0, 10)
  const { data: user } = await supabase.from('profiles').select('*').eq('email', email).maybeSingle()

  if (!user) {
    // RLS only lets self, the contributor's lead, or an admin read their
    // profiles/task_submissions rows directly — a peer contributor viewing
    // someone else falls back to this security-definer RPC, which exposes
    // rollups only (never raw task IDs, links, or per-row status).
    const { data: rows, error } = await supabase.rpc('contributor_public_stats', {
      p_target_email: email,
      p_week_start: weekStart,
    })
    if (error) throw error
    const stats = rows?.[0]
    const publicUser: User | null = stats
      ? {
          id: stats.id,
          name: stats.name,
          email,
          role: stats.role as User['role'],
          shift: null,
          meet_link: null,
          is_active: stats.is_active,
          last_seen_at: null,
          lead_id: stats.lead_id,
          avatar_url: stats.avatar_url,
          must_change_password: false,
        }
      : null
    return {
      user: publicUser,
      cb_email: email,
      week_start: weekStart,
      week_end: weekEnd,
      weekly_target: stats?.weekly_target ?? 50,
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

  const [{ data: rows }, { data: target }] = await Promise.all([
    supabase.from('task_submissions').select('*').eq('cb_email', email).order('date', { ascending: false }),
    supabase.from('weekly_targets').select('target').eq('user_id', user?.id ?? '').eq('week_start', weekStart).maybeSingle(),
  ])
  const submissions = withProject((rows ?? []) as TaskSubmission[], await projects())
  const weekRows = submissions.filter((row) => row.date && row.date >= weekStart && row.date <= weekEnd)
  const stageBreakdown = submissions.reduce<Record<string, number>>((counts, row) => ({ ...counts, [row.stage]: (counts[row.stage] ?? 0) + 1 }), {})
  const projectBreakdown = submissions.reduce<Record<string, number>>((counts, row) => {
    const name = row.project?.name ?? 'Unassigned'
    return { ...counts, [name]: (counts[name] ?? 0) + 1 }
  }, {})
  return { user: user as User | null, cb_email: email, week_start: weekStart, week_end: weekEnd, weekly_target: target?.target ?? 50, submitted_this_week: weekRows.filter((row) => row.status === 'submitted').length, total_submitted: submissions.filter((row) => row.status === 'submitted').length, total_logged: submissions.length, stage_breakdown: stageBreakdown, project_breakdown: Object.entries(projectBreakdown).map(([name, total]) => ({ name, total })), week_submissions: weekRows, recent_submissions: submissions.slice(0, 10), all_submissions: submissions, is_public_view: false }
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

async function listHouseRules(): Promise<HouseRule[]> {
  const { data } = await result(supabase.from('house_rules').select('*').order('sort_order'))
  return withProject(data as HouseRule[], await projects()) as HouseRule[]
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

export function touchPresence() {
  supabase.rpc('touch_presence').then(({ error }) => {
    if (error) console.warn('Could not update presence:', error.message)
  })
}

export const api = {
  async get<T>(path: string, options?: { params?: Record<string, unknown> }): Promise<Response<T>> {
    const params = options?.params ?? {}
    if (path === '/me') return { data: { user: await currentProfile() } as T }
    if (path === '/projects') return { data: (await projects()) as T }
    if (path === '/resources') return { data: (await listResources()) as T }
    if (path === '/house-rules') return { data: (await listHouseRules()) as T }
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
    await currentProfile()
    if (path === '/users') {
      const { data, error } = await supabase.functions.invoke('manage-user', { body: payload })
      if (error) throw await functionErrorMessage(error)
      return { data: data as T }
    }
    const table = path.slice(1).replace('task-submissions', 'task_submissions').replace('house-rules', 'house_rules')
    const row = path === '/task-submissions' ? { ...payload, user_id: (await supabase.auth.getUser()).data.user?.id } : payload
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
    const table = resource === 'users' ? 'profiles' : resource.replace('task-submissions', 'task_submissions').replace('house-rules', 'house_rules')
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
    const table = resource.replace('task-submissions', 'task_submissions').replace('house-rules', 'house_rules')
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) throw error
    return { data: null }
  },
}
