import { supabase } from './api'
import { fetchAllPages } from './fetchAll'
import type { Attendance, AttendanceHours, User } from '../types'

export { ATTENDANCE_CLOSES_LABEL, ATTENDANCE_CLOSES_MIN, ATTENDANCE_OPENS_MIN, attendanceWindow, type AttendanceWindow } from './attendanceWindow'

export const HOURS_LABELS: Record<AttendanceHours, string> = {
  '1-2': '1–2 hours',
  '2-4': '2–4 hours',
  '4-6': '4–6 hours',
  '7+': '7 hours and above',
  absent: 'Absent',
  discontinued: 'Discontinued',
  disabled: 'Disabled',
}

export const CONTRIBUTOR_HOURS: AttendanceHours[] = ['1-2', '2-4', '4-6', '7+']
// Only a lead or admin files these, for someone who can't file themselves.
export const SUPPORT_HOURS: AttendanceHours[] = ['absent', 'discontinued', 'disabled']

// Picking this one asks for the Task ID and a screenshot of progress.
export const TASKING = 'Tasking'

// The old Google Form's list, in its order.
export const TASKING_STATUSES = [
  TASKING,
  'Training',
  'Primary Course Completed – Empty Queue',
  'Secondary Course Completed – Empty Queue',
  'Tertiary Course Completed – Empty Queue',
  'All Courses Completed (Primary, Secondary & Tertiary) – Empty Queue',
  'Course Pending – Empty Queue',
  'Present: Empty – due to throttling after completing a few tasks.',
  'BM Linter Issues',
  'Present Disabled (BM)',
  'Present Disabled (Quality)',
  'Present - Project management initiated (error)',
  'Power interruption',
  'Absent',
  'Absent - Account Issue',
  'Absent Empty Queue',
  'Absent Disabled (BM)',
  'Absent Disabled (Quality)',
  'Absent - Project management initiated (error)',
  'Discontinued - Personal Issue',
  'Discontinued - Pay Issue',
  'Discontinued - Disabled (BM)',
  'Discontinued - Quality Issue',
  'EQ - waiting for WT assignment',
]

export type AttendanceWithFiler = Attendance & {
  person: { id: string; name: string; email: string; lead_id: string | null; avatar_url: string | null } | null
  // Null when the viewer isn't allowed to read the filer's profile.
  filer: { id: string; name: string } | null
}

const ATTENDANCE_SELECT =
  '*, person:profiles!attendance_user_id_fkey(id, name, email, lead_id, avatar_url), filer:profiles!attendance_filed_by_fkey(id, name)'

/** Everyone's attendance for one day that the caller can see (RLS scopes it to their team). */
export async function fetchAttendanceForDate(date: string): Promise<AttendanceWithFiler[]> {
  return fetchAllPages<AttendanceWithFiler>((from, to) =>
    supabase.from('attendance').select(ATTENDANCE_SELECT).eq('date', date).order('id').range(from, to),
  )
}

/** One person's attendance, newest first. */
export async function fetchAttendanceHistory(userId: string, limit = 60): Promise<AttendanceWithFiler[]> {
  const { data, error } = await supabase
    .from('attendance')
    .select(ATTENDANCE_SELECT)
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data as AttendanceWithFiler[]
}

/** The caller's own entry for a day, or null if they haven't filed. */
export async function fetchOwnAttendance(userId: string, date: string): Promise<Attendance | null> {
  const { data, error } = await supabase.from('attendance').select('*').eq('user_id', userId).eq('date', date).maybeSingle()
  if (error) throw error
  return data as Attendance | null
}

/**
 * Active contributors the caller can see, plus the leads (for an admin's team filter). RLS scopes a
 * lead to their own attached contributors.
 */
export async function fetchAttendanceRoster(): Promise<{ contributors: User[]; leads: User[] }> {
  const people = await fetchAllPages<User>((from, to) =>
    supabase.from('profiles').select('*').in('role', ['contributor', 'lead']).eq('is_active', true).order('id').range(from, to),
  )
  const byName = (a: User, b: User) => a.name.localeCompare(b.name)
  return {
    contributors: people.filter((p) => p.role === 'contributor').sort(byName),
    leads: people.filter((p) => p.role === 'lead').sort(byName),
  }
}

export interface AttendanceInput {
  userId: string
  date: string
  hours: AttendanceHours
  taskingStatus: string
  taskId: string
  screenshotUrl: string
  // A just-taken photo's reference from uploadAttendancePhoto(); null keeps the day's existing photo.
  photoRef?: string | null
}

/** Files (or replaces) someone's attendance for a day. */
export async function fileAttendance(input: AttendanceInput): Promise<void> {
  const { error } = await supabase.rpc('file_attendance', {
    p_user_id: input.userId,
    p_date: input.date,
    p_hours: input.hours,
    p_tasking_status: input.taskingStatus,
    p_task_id: input.taskId,
    p_screenshot_url: input.screenshotUrl,
    p_photo_ref: input.photoRef ?? null,
  })
  if (error) throw error
}

export async function deleteAttendance(id: number): Promise<void> {
  const { error } = await supabase.from('attendance').delete().eq('id', id)
  if (error) throw error
}

/** True once the entry has reached the Google Form (only its first submission is ever sent). */
export function sentToGoogleForm(entry: Attendance): boolean {
  return Boolean(entry.google_form_sent_at)
}
