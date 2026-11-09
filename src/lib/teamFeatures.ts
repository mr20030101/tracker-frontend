import { useQuery } from '@tanstack/react-query'
import { supabase } from './api'

// Parts of the Tracker a lead can switch off for their own team (see 20261106_team_features.sql).
// Everything is on until a lead or admin turns it off.
export interface TeamFeatures {
  ctsEnabled: boolean
  attendanceEnabled: boolean
  // Contributors see the whole team's attendance for the day (20261106_team_attendance_public.sql).
  attendancePublic: boolean
  // The CTS Form's "Under Trainer Team" answer for the team's contributors; null leaves it blank.
  ctsTrainer: string | null
  // Finished tasks are sent to the Back Up Task Tracker Google Form (20261109_task_backup_form.sql). Off by default.
  backupFormEnabled: boolean
  // Bootcamp or RST (20261109_team_program.sql): RST teams file extensions on the RST form.
  program: TeamProgram
}

export type TeamProgram = 'bootcamp' | 'rst'

interface TeamFeaturesRow {
  cts_enabled: boolean
  attendance_enabled: boolean
  attendance_public: boolean
  cts_trainer: string | null
  backup_form_enabled: boolean
  program: TeamProgram | null
}

const fromRow = (r: TeamFeaturesRow): TeamFeatures => ({
  ctsEnabled: r.cts_enabled,
  attendanceEnabled: r.attendance_enabled,
  attendancePublic: r.attendance_public,
  ctsTrainer: r.cts_trainer,
  backupFormEnabled: r.backup_form_enabled ?? false,
  program: r.program ?? 'bootcamp',
})

export const ALL_FEATURES_ON: TeamFeatures = { ctsEnabled: true, attendanceEnabled: true, attendancePublic: false, ctsTrainer: null, backupFormEnabled: false, program: 'bootcamp' }

/** The features of one person's team: a contributor's lead's, or a lead's own. All on for an admin. */
export async function fetchTeamFeaturesFor(userId: string): Promise<TeamFeatures> {
  const { data, error } = await supabase.rpc('team_features_for', { p_user_id: userId })
  if (error) throw error
  const row = (Array.isArray(data) ? data[0] : data) as TeamFeaturesRow | undefined
  return row ? fromRow(row) : ALL_FEATURES_ON
}

/** Teams that switched something off, by lead id: every team's for an admin, a lead's own. */
export async function fetchTeamFeaturesList(): Promise<Map<string, TeamFeatures>> {
  const { data, error } = await supabase.rpc('team_features_list')
  if (error) throw error
  const rows = (data ?? []) as (TeamFeaturesRow & { lead_id: string })[]
  return new Map(rows.map((r) => [r.lead_id, fromRow(r)]))
}

/** Turns a team's CTS Form, Attendance and public attendance on or off (the lead themselves, or an admin). */
export async function setTeamFeatures(leadId: string, features: TeamFeatures): Promise<void> {
  const { error } = await supabase.rpc('set_team_features', {
    p_lead_id: leadId,
    p_cts_enabled: features.ctsEnabled,
    p_attendance_enabled: features.attendanceEnabled,
    p_attendance_public: features.attendancePublic,
  })
  if (error) throw error
}

/** Sets (or, blank, clears) a team's CTS trainer, as the option reads in the CTS form. */
export async function setTeamCtsTrainer(leadId: string, trainer: string): Promise<void> {
  const { error } = await supabase.rpc('set_team_cts_trainer', { p_lead_id: leadId, p_trainer: trainer })
  if (error) throw error
}

/** Turns sending a team's finished tasks to the Back Up Task Tracker form on or off. */
export async function setTeamBackupForm(leadId: string, enabled: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_team_backup_form', { p_lead_id: leadId, p_enabled: enabled })
  if (error) throw error
}

/** Moves a team to Bootcamp or RST (admins only). */
export async function setTeamProgram(leadId: string, program: TeamProgram): Promise<void> {
  const { error } = await supabase.rpc('set_team_program', { p_lead_id: leadId, p_program: program })
  if (error) throw error
}

const ALL_FEATURES_OFF: TeamFeatures = { ctsEnabled: false, attendanceEnabled: false, attendancePublic: false, ctsTrainer: null, backupFormEnabled: false, program: 'bootcamp' }

/**
 * The features of `userId`'s team. Until it loads, everything is hidden, so a team that has
 * something off doesn't see it flash up first. Re-read every few minutes, so a lead's change is
 * picked up without a reload. `loaded` says whether it's the real answer yet.
 */
export function useTeamFeatures(userId: string | null | undefined): TeamFeatures & { loaded: boolean } {
  const { data, isSuccess } = useQuery({
    queryKey: ['team-features', userId],
    queryFn: () => fetchTeamFeaturesFor(userId!),
    enabled: Boolean(userId),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  })
  return { ...(data ?? ALL_FEATURES_OFF), loaded: isSuccess }
}
