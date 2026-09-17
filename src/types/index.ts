export interface User {
  id: string
  name: string
  email: string
  role: 'contributor' | 'lead' | 'admin'
  shift: string | null
  meet_link: string | null
  is_active: boolean
  last_seen_at: string | null
  lead_id: string | null
  avatar_url: string | null
}

export type ActivityEvent = 'login' | 'login_failed' | 'logout'

export interface ActivityLog {
  id: number
  user_id: string | null
  email: string | null
  event: ActivityEvent
  user_agent: string | null
  created_at: string
  user: Pick<User, 'id' | 'name' | 'email'> | null
}

export interface Project {
  id: number
  name: string
}

export type Stage = 'attempt' | 'l0' | 'l1'
export type SubmissionStatus = 'submitted' | 'in_progress' | 'empty' | 'expired' | 'claimed_by_another'

// A contributor's rank on a given project — distinct from Stage above,
// which describes a task submission's own pipeline stage.
export type ProjectLevel = 'contributor' | 'l0' | 'l1' | 'l10'

export interface ContributorProjectLevel {
  id: number
  user_id: string
  project_id: number
  level: ProjectLevel
}

export interface TaskSubmission {
  id: number
  task_id: string | null
  cb_email: string
  user_id: string | null
  project_id: number | null
  project: Project | null
  stage: Stage
  status: SubmissionStatus
  notes: string | null
  date: string | null
  submitted_at: string | null
}

export interface Paginated<T> {
  data: T[]
  current_page: number
  last_page: number
  total: number
  from: number | null
  to: number | null
}

export interface Resource {
  id: number
  category: string
  title: string
  url: string
  project_id: number | null
  project: Project | null
}

export interface HouseRule {
  id: number
  project_id: number | null
  type: 'info' | 'rule'
  title: string | null
  body: string
  project: Project | null
}

export interface DashboardRow {
  user_id: string
  cb_email: string
  name: string
  is_active: boolean
  tasks_submitted: number
  weekly_target: number
  progress: number
}

export interface DashboardSummary {
  week_start: string
  week_end: string
  data: DashboardRow[]
  daily_report: DailyReportRow[]
}

export interface DailyReportRow {
  date: string
  tasks_submitted: number
  tasks_logged: number
  contributors_submitted: number
  contributors_without_submissions: number
}

export interface ProjectBreakdown {
  name: string
  total: number
}

export interface DirectoryUser {
  id: string
  name: string
  is_active: boolean
  last_seen_at: string | null
  avatar_url: string | null
}

export interface Message {
  id: number
  sender_id: string
  recipient_id: string
  body: string
  read_at: string | null
  deleted_by_sender: boolean
  deleted_by_recipient: boolean
  created_at: string
}

export interface Conversation {
  otherUserId: string
  otherUserName: string
  otherUserAvatarUrl: string | null
  lastMessage: Message
  unreadCount: number
}

export interface ContributorProfile {
  user: User | null
  cb_email: string
  week_start: string
  week_end: string
  weekly_target: number
  submitted_this_week: number
  total_submitted: number
  total_logged: number
  stage_breakdown: Partial<Record<Stage, number>>
  project_breakdown: ProjectBreakdown[]
  week_submissions: TaskSubmission[]
  recent_submissions: TaskSubmission[]
  all_submissions: TaskSubmission[]
}
