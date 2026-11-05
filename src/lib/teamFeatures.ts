import { useQuery } from '@tanstack/react-query'
import { supabase } from './api'

// Parts of the Tracker a lead can switch off for their own team (see 20261106_team_features.sql).
// Everything is on until a lead or admin turns it off.
export interface TeamFeatures {
  ctsEnabled: boolean
  attendanceEnabled: boolean
}

export const ALL_FEATURES_ON: TeamFeatures = { ctsEnabled: true, attendanceEnabled: true }

/** The features of one person's team: a contributor's lead's, or a lead's own. All on for an admin. */
export async function fetchTeamFeaturesFor(userId: string): Promise<TeamFeatures> {
  const { data, error } = await supabase.rpc('team_features_for', { p_user_id: userId })
  if (error) throw error
  const row = (Array.isArray(data) ? data[0] : data) as { cts_enabled: boolean; attendance_enabled: boolean } | undefined
  return row ? { ctsEnabled: row.cts_enabled, attendanceEnabled: row.attendance_enabled } : ALL_FEATURES_ON
}

/** Teams that switched something off, by lead id: every team's for an admin, a lead's own. */
export async function fetchTeamFeaturesList(): Promise<Map<string, TeamFeatures>> {
  const { data, error } = await supabase.rpc('team_features_list')
  if (error) throw error
  const rows = (data ?? []) as { lead_id: string; cts_enabled: boolean; attendance_enabled: boolean }[]
  return new Map(rows.map((r) => [r.lead_id, { ctsEnabled: r.cts_enabled, attendanceEnabled: r.attendance_enabled }]))
}

/** Turns a team's CTS Form and Attendance on or off (the lead themselves, or an admin). */
export async function setTeamFeatures(leadId: string, features: TeamFeatures): Promise<void> {
  const { error } = await supabase.rpc('set_team_features', {
    p_lead_id: leadId,
    p_cts_enabled: features.ctsEnabled,
    p_attendance_enabled: features.attendanceEnabled,
  })
  if (error) throw error
}

const ALL_FEATURES_OFF: TeamFeatures = { ctsEnabled: false, attendanceEnabled: false }

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
