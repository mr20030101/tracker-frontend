import { createClient } from '@supabase/supabase-js'
import type { ContributorProfile, DashboardSummary, HouseRule, Paginated, Project, Resource, TaskSubmission, User } from '../types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() || 'https://ieovepkcseytccagzedg.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imllb3ZlcGtjc2V5dGNjYWd6ZWRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkxNjU1NDUsImV4cCI6MjEwNDc0MTU0NX0.OMZEAONl3XoSwjb_RhYo70fYXThONXVBGQLlGF-OQ7s'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

type Response<T> = { data: T }

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

async function submissions(params: Record<string, unknown> = {}): Promise<Paginated<TaskSubmission>> {
  const profile = await currentProfile()
  let query = supabase.from('task_submissions').select('*', { count: 'exact' }).order('date', { ascending: false })
  if (profile.role === 'contributor') query = query.eq('user_id', profile.id)
  if (params.stage) query = query.eq('stage', params.stage)
  if (params.cb_email) query = query.ilike('cb_email', `%${params.cb_email}%`)
  const page = Number(params.page ?? 1)
  const from = (page - 1) * 25
  const to = from + 24
  const { data, error, count } = await query.range(from, to)
  if (error) throw error
  const rows = withProject((data ?? []) as TaskSubmission[], await projects())
  const total = count ?? rows.length
  return { data: rows, current_page: page, last_page: Math.max(1, Math.ceil(total / 25)), total, from: total ? from + 1 : null, to: total ? Math.min(to + 1, total) : null }
}

async function dashboard(params: Record<string, unknown>): Promise<DashboardSummary> {
  const weekStart = String(params.week_start)
  const weekEndDate = new Date(`${weekStart}T00:00:00Z`)
  weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 6)
  const weekEnd = weekEndDate.toISOString().slice(0, 10)
  const [{ data: users }, { data: submissions }, { data: targets }] = await Promise.all([
    supabase.from('profiles').select('*').eq('role', 'contributor').order('name'),
    supabase.from('task_submissions').select('user_id, cb_email, project_id, status').gte('date', weekStart).lte('date', weekEnd),
    supabase.from('weekly_targets').select('*').eq('week_start', weekStart),
  ])
  const projectId = params.project_id ? Number(params.project_id) : null
  const rows = (users ?? []).map((user) => {
    const entries = (submissions ?? []).filter(
      (submission) =>
        (submission.user_id === user.id || submission.cb_email?.toLowerCase() === user.email.toLowerCase()) &&
        (!projectId || submission.project_id === projectId),
    )
    const submitted = entries.filter((entry) => entry.status === 'submitted').length
    const target = (targets ?? []).find((item) => item.user_id === user.id)?.target ?? 50
    return { user_id: user.id, cb_email: user.email, name: user.name, is_active: user.is_active, tasks_submitted: submitted, weekly_target: target, progress: target ? submitted / target : 0 }
  })
  return { week_start: weekStart, week_end: weekEnd, data: rows }
}

async function contributor(params: Record<string, unknown>): Promise<ContributorProfile> {
  const email = String(params.email)
  const weekStart = String(params.week_start)
  const weekEndDate = new Date(`${weekStart}T00:00:00Z`)
  weekEndDate.setUTCDate(weekEndDate.getUTCDate() + 6)
  const weekEnd = weekEndDate.toISOString().slice(0, 10)
  const { data: user } = await supabase.from('profiles').select('*').eq('email', email).maybeSingle()
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
  return { user: user as User | null, cb_email: email, week_start: weekStart, week_end: weekEnd, weekly_target: target?.target ?? 50, submitted_this_week: weekRows.filter((row) => row.status === 'submitted').length, total_submitted: submissions.filter((row) => row.status === 'submitted').length, total_logged: submissions.length, stage_breakdown: stageBreakdown, project_breakdown: Object.entries(projectBreakdown).map(([name, total]) => ({ name, total })), week_submissions: weekRows, recent_submissions: submissions.slice(0, 10) }
}

async function listResources(): Promise<Resource[]> {
  const { data } = await result(supabase.from('resources').select('*').order('sort_order'))
  return withProject(data as Resource[], await projects()) as Resource[]
}

async function listHouseRules(): Promise<HouseRule[]> {
  const { data } = await result(supabase.from('house_rules').select('*').order('sort_order'))
  return withProject(data as HouseRule[], await projects()) as HouseRule[]
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
    if (path === '/contributor') return { data: (await contributor(params)) as T }
    throw new Error(`Unsupported GET endpoint: ${path}`)
  },
  async post<T>(path: string, payload: Record<string, unknown>): Promise<Response<T>> {
    await currentProfile()
    if (path === '/users') {
      const { data, error } = await supabase.functions.invoke('manage-user', { body: payload })
      if (error) throw error
      return { data: data as T }
    }
    const table = path.slice(1).replace('task-submissions', 'task_submissions').replace('house-rules', 'house_rules')
    const row = path === '/task-submissions' ? { ...payload, user_id: (await supabase.auth.getUser()).data.user?.id } : payload
    const { data, error } = await supabase.from(table).insert(row).select().single()
    if (error) throw error
    return { data: data as T }
  },
  async patch<T>(path: string, payload: Record<string, unknown>): Promise<Response<T>> {
    await currentProfile()
    const [, resource, id] = path.split('/')
    if (resource === 'users' && payload.password) {
      const { data, error } = await supabase.functions.invoke('manage-user', { body: { id, ...payload } })
      if (error) throw error
      return { data: data as T }
    }
    const table = resource === 'users' ? 'profiles' : resource.replace('task-submissions', 'task_submissions').replace('house-rules', 'house_rules')
    const { data, error } = await supabase.from(table).update(payload).eq('id', id).select().single()
    if (error) throw error
    return { data: data as T }
  },
  async delete(path: string): Promise<Response<null>> {
    await currentProfile()
    const [, resource, id] = path.split('/')
    const table = resource.replace('task-submissions', 'task_submissions').replace('house-rules', 'house_rules')
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) throw error
    return { data: null }
  },
}
