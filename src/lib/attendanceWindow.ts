import { sgMinutesSinceMidnight, toISODate } from './week.js'

// Attendance is taken from 6:00 AM, Singapore time, until a closing time an admin sets for everyone
// and a lead can change for their own team (1:30 PM unless changed). file_attendance() checks the
// same window (supabase/migrations/20261021_attendance_close_time.sql), so change both together.
// Kept free of the Supabase client so api/attendance-photo can load it too (hence the .js import).
export const ATTENDANCE_OPENS_MIN = 6 * 60
// The default closing time, until the setting has loaded.
export const ATTENDANCE_CLOSES_MIN = 13 * 60 + 30
// A closing time must fall after opening and before midnight; the database checks the same.
export const ATTENDANCE_CLOSES_MIN_RANGE = { min: ATTENDANCE_OPENS_MIN + 1, max: 24 * 60 - 1 }

// Days the window stays open all day, e.g. to try out a change. file_attendance() has the same list
// (supabase/migrations/20261017_attendance_photo.sql). Past dates do nothing, so clear them when convenient.
export const OPEN_ALL_DAY_DATES = new Set(['2026-10-17'])

export type AttendanceWindow = 'not-open' | 'open' | 'closed'

export function attendanceWindow(date: Date, closesMin: number = ATTENDANCE_CLOSES_MIN): AttendanceWindow {
  if (OPEN_ALL_DAY_DATES.has(toISODate(date))) return 'open'
  const minutes = sgMinutesSinceMidnight(date)
  if (minutes < ATTENDANCE_OPENS_MIN) return 'not-open'
  return minutes < closesMin ? 'open' : 'closed'
}

/** Minutes after midnight as a clock time, e.g. 810 -> '1:30 PM'. */
export function attendanceTimeLabel(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = String(minutes % 60).padStart(2, '0')
  return `${h % 12 || 12}:${m} ${h < 12 ? 'AM' : 'PM'}`
}

/** For an <input type="time">: 810 -> '13:30'. */
export function minutesToTimeInput(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

/** From an <input type="time">: '13:30' -> 810, or null if it isn't a time. */
export function timeInputToMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})/.exec(value)
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}
