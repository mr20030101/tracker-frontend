import { sgMinutesSinceMidnight, toISODate } from './week.js'

// Attendance is only taken 6:00 AM – 1:30 PM, Singapore time. file_attendance() checks the same
// window (supabase/migrations/20261017_attendance_close_1330.sql), so change both together. Kept free of the
// Supabase client so api/attendance-photo can load it too (hence the .js import).
export const ATTENDANCE_OPENS_MIN = 6 * 60
export const ATTENDANCE_CLOSES_MIN = 13 * 60 + 30
export const ATTENDANCE_CLOSES_LABEL = '1:30 PM'

// Days the window stays open all day, e.g. to try out a change. file_attendance() has the same list
// (supabase/migrations/20261017_attendance_photo.sql). Past dates do nothing, so clear them when convenient.
export const OPEN_ALL_DAY_DATES = new Set(['2026-10-17'])

export type AttendanceWindow = 'not-open' | 'open' | 'closed'

export function attendanceWindow(date: Date): AttendanceWindow {
  if (OPEN_ALL_DAY_DATES.has(toISODate(date))) return 'open'
  const minutes = sgMinutesSinceMidnight(date)
  if (minutes < ATTENDANCE_OPENS_MIN) return 'not-open'
  return minutes < ATTENDANCE_CLOSES_MIN ? 'open' : 'closed'
}
