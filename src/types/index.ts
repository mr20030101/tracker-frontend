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
  must_change_password: boolean
  // A lead's public application form: false while they have it switched off.
  accepting_applications: boolean
  // A CB's own Remotasks worker ID, self-set from Edit Profile.
  remotasks_id: string | null
  // A short self-written line shown on the profile page, self-set from Edit Profile.
  bio: string | null
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

// One manager action from the audit trail (see audit_logs in schema.sql). `action` is a short code
// like 'role_changed' or 'request_approved'; `summary` is the readable sentence.
export interface AuditLog {
  id: number
  actor_id: string | null
  action: string
  target_user_id: string | null
  summary: string
  details: Record<string, unknown> | null
  created_at: string
  actor: Pick<User, 'id' | 'name' | 'email' | 'avatar_url'> | null
}

export interface Project {
  id: number
  name: string
  // The project's option in the CTS Tracker form's "Tracking Project" question.
  code: string | null
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
  snipboard_url: string | null
  cts_submitted_at: string | null
  created_at: string
  updated_at?: string
}

export type RequestType = 'extension' | 'reclaim' | 'bad_video'
export type RequestStatus = 'pending' | 'approved' | 'denied'

interface BaseTaskRequest {
  id: number
  task_submission_id: number
  requested_by: string
  reason: string | null
  status: RequestStatus
  requested_at: string
  reviewed_by: string | null
  reviewed_at: string | null
}

// A contributor asking their lead for more time before a submission is marked expired.
export interface ExtensionTaskRequest extends BaseTaskRequest {
  type: 'extension'
}

// A contributor asking their lead to reclaim a task back for them — same self-service flow and
// Scale form as an extension request, filed with "Reclaim" as the request type instead.
export interface ReclaimTaskRequest extends BaseTaskRequest {
  type: 'reclaim'
}

// A lead/admin flagging a claimed task's video as bad, needing validation/removal
// (the ALOHA | URSA | YAM QA flow) — same pending/approved/denied lifecycle as an
// extension request, but not self-service and not tied to team attachment.
export interface BadVideoTaskRequest extends BaseTaskRequest {
  type: 'bad_video'
  bad_video_category: string
  bad_video_frame: string
  bad_video_workforce: 'REMOTE' | 'ONSITE'
  bad_video_workforce_name: string
}

export type TaskRequest = ExtensionTaskRequest | ReclaimTaskRequest | BadVideoTaskRequest

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

export interface DashboardRow {
  user_id: string
  cb_email: string
  name: string
  lead_id: string | null
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
  project_report: ProjectReportRow[]
}

// Totals per project for the range (submissions with no project under "Unassigned").
export interface ProjectReportRow {
  project_id: number | null
  name: string
  tasks_submitted: number
  tasks_logged: number
  contributors_submitted: number
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
  role: User['role']
  is_bot: boolean
  // For contributors, email is always null and last_seen_at is only set for people online right now.
  email: string | null
  // Managers only (null for contributors): lets the group-chat picker add a whole team or project.
  lead_id: string | null
}

export interface LeaderboardRow {
  user_id: string
  name: string
  avatar_url: string | null
  cb_email: string
  tasks_submitted: number
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

export interface ConversationSummary {
  other_user_id: string
  unread_count: number
  // The conversation's last few messages, oldest first.
  recent: Message[]
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
  // True when RLS blocked the direct profile/submissions read and the
  // contributor_public_stats RPC fallback was used instead — the caller's
  // role isn't a reliable signal for this (e.g. a lead who isn't this
  // contributor's assigned lead is still RLS-blocked despite the role).
  // CbProfile.tsx must gate on this, not on currentUser.role, to decide
  // whether the raw per-row queries (submissions table, project levels)
  // will actually return anything.
  is_public_view: boolean
  // Only set on the peer-view fallback (contributor_public_stats RPC), where
  // all_submissions is deliberately empty — see contributor() in lib/api.ts.
  submission_trend?: { date: string; value: number }[]
  project_levels?: { project_id: number; level: ProjectLevel }[]
}

export type HiringStatus = 'pending' | 'accepted' | 'denied'

// One submission of a lead's public application form.
export interface HiringApplication {
  id: number
  lead_id: string
  remotasks_email: string | null
  remotasks_id: string | null
  full_name: string
  active_email: string
  facebook_url: string
  has_robotics_background: boolean
  // Step 2 of the form. Null on an application received before that step existed.
  has_personal_computer: boolean | null
  has_stable_internet: boolean | null
  cpu: string | null
  gpu: string | null
  gpu_memory_gb: number | null
  status: HiringStatus
  reviewed_by: string | null
  reviewed_at: string | null
  // When the applicant was last emailed from the Accepted tab; null if never.
  emailed_at: string | null
  // When an accepted applicant was marked onboarded (after the bootcamp); null until someone flips it.
  onboarded_at: string | null
  // The login created for this applicant. Accepting doesn't create it; a separate step does, so it is null until then.
  user_id: string | null
  // The lead's own notes on the applicant; never shown to them. Null when there are none.
  notes: string | null
  created_at: string
}

export type AnnouncementAudience = 'everyone' | 'team' | 'project'

export interface Announcement {
  id: number
  author_id: string
  audience: AnnouncementAudience
  team_lead_id: string | null
  project_id: number | null
  title: string
  body: string
  pinned: boolean
  created_at: string
  updated_at: string
  author: Pick<User, 'id' | 'name' | 'avatar_url'> | null
}

// One person an announcement is for; read_at is null until they've opened Announcements since.
export interface AnnouncementReader {
  user_id: string
  name: string
  avatar_url: string | null
  read_at: string | null
}

export type OnboardingStep = 'photo' | 'remotasks_id' | 'shift' | 'read_resources' | 'first_task' | 'message_lead'

export interface OnboardingStatus {
  user_id: string
  steps: Record<OnboardingStep, boolean>
  done: number
  total: number
  dismissed: boolean
}

export interface Achievements {
  user_id: string
  current_streak: number
  best_streak: number
  weeks_hit: number
  total_submitted: number
  best_week: number
}

export interface ChatGroupMember {
  id: string
  name: string
  avatar_url: string | null
  role: 'owner' | 'member'
}

export interface GroupMessage {
  id: number
  group_id: number
  sender_id: string
  body: string
  created_at: string
}

export interface ChatGroupSummary {
  id: number
  name: string
  my_role: 'owner' | 'member'
  created_at: string
  unread_count: number
  last_message: GroupMessage | null
  members: ChatGroupMember[]
}
