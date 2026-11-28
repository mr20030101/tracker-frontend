import { supabase } from './api'
import { fetchScreenshotFrom, uploadScreenshotTo } from './support'
import type { TeamProgram } from './teamFeatures'

export { screenshotToJpeg } from './support'

// Screenshots go to Google Drive through api/hubstaff-screenshot (see hubstaffScreenshotGate.ts).
const SCREENSHOT_ENDPOINT = '/api/hubstaff-screenshot'

export interface HubstaffEntry {
  id: number
  user_id: string
  date: string
  minutes: number
  filed_minutes: number
  screenshot_ref: string
  corrected_by: string | null
  corrected_at: string | null
  created_at: string
  updated_at: string
}

/** Who can open the Hubstaff page: RST contributors and leads, the RST team manager, and admins. */
export function hubstaffAllowed(
  user: { role: string; program?: TeamProgram | null } | null | undefined,
  teamProgram: TeamProgram,
  loaded: boolean,
): boolean {
  if (!user) return false
  if (user.role === 'admin') return true
  if (user.role === 'team_manager') return user.program === 'rst'
  return (user.role === 'lead' || user.role === 'contributor') && (teamProgram === 'rst' || !loaded)
}

/** Reads what Hubstaff shows: "7:32", "7:32:10", "7h 32m", "7.5" or "7". Null if it isn't a time of day's length. */
export function parseHubstaffHours(input: string): number | null {
  const text = input.trim().toLowerCase()
  if (!text) return null
  let minutes: number | null = null
  const clock = text.match(/^(\d{1,2}):([0-5]\d)(?::([0-5]\d))?$/)
  const units = text.match(/^(?:(\d{1,2})\s*h(?:rs?|ours?)?)?\s*(?:(\d{1,4})\s*m(?:in(?:utes?)?)?)?$/)
  if (clock) minutes = Number(clock[1]) * 60 + Number(clock[2])
  else if (/^\d{1,2}(?:\.\d+)?$/.test(text)) minutes = Math.round(Number(text) * 60)
  else if (units && (units[1] || units[2])) minutes = Number(units[1] ?? 0) * 60 + Number(units[2] ?? 0)
  return minutes !== null && minutes >= 0 && minutes <= 1440 ? minutes : null
}

export function formatHubstaffHours(minutes: number): string {
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`
}

export const uploadHubstaffScreenshot = (jpeg: Blob, onProgress: (fraction: number) => void) =>
  uploadScreenshotTo(SCREENSHOT_ENDPOINT, jpeg, onProgress)

export const fetchHubstaffScreenshot = (ref: string) => fetchScreenshotFrom(SCREENSHOT_ENDPOINT, ref)

const COLUMNS = 'id, user_id, date, minutes, filed_minutes, screenshot_ref, corrected_by, corrected_at, created_at, updated_at'

export async function fetchOwnHubstaffHours(userId: string, limit = 60): Promise<HubstaffEntry[]> {
  const { data, error } = await supabase.from('hubstaff_hours').select(COLUMNS).eq('user_id', userId).order('date', { ascending: false }).limit(limit)
  if (error) throw error
  return (data ?? []) as HubstaffEntry[]
}

/** Everyone's entries for a day that RLS lets the caller see (their team, or every team for an admin). */
export async function fetchHubstaffHoursOn(date: string): Promise<HubstaffEntry[]> {
  const { data, error } = await supabase.from('hubstaff_hours').select(COLUMNS).eq('date', date)
  if (error) throw error
  return (data ?? []) as HubstaffEntry[]
}

export async function fileHubstaffHours(date: string, minutes: number, screenshotRef: string | null): Promise<void> {
  const { error } = await supabase.rpc('file_hubstaff_hours', { p_date: date, p_minutes: minutes, p_screenshot_ref: screenshotRef })
  if (error) throw error
}

export async function correctHubstaffHours(id: number, minutes: number): Promise<void> {
  const { error } = await supabase.rpc('correct_hubstaff_hours', { p_id: id, p_minutes: minutes })
  if (error) throw error
}
