import { useQuery } from '@tanstack/react-query'
import { supabase } from './api'

// Profile views (supabase/migrations/20261001_profile_views.sql): opening a teammate's profile
// counts once per viewer per day; your own never counts. Only totals come back, never who viewed.

export interface ProfileViewCount {
  views: number
  viewers: number
}

export interface MostViewedRow {
  user_id: string
  name: string
  avatar_url: string | null
  views: number
  viewers: number
}

export async function recordProfileView(profileId: string): Promise<void> {
  const { error } = await supabase.rpc('record_profile_view', { p_profile_id: profileId })
  if (error) throw error
}

export function useProfileViewCount(profileId: string | null) {
  return useQuery({
    queryKey: ['profile-views', profileId],
    queryFn: async (): Promise<ProfileViewCount> => {
      const { data, error } = await supabase.rpc('profile_view_count', { p_profile_id: profileId })
      if (error) throw error
      const row = (data as { views: number; viewers: number }[] | null)?.[0]
      return { views: Number(row?.views ?? 0), viewers: Number(row?.viewers ?? 0) }
    },
    enabled: Boolean(profileId),
  })
}

/** `since` is an ISO date (yyyy-mm-dd), or null for all time. */
export function useMostViewedProfiles(since: string | null, limit = 10) {
  return useQuery({
    queryKey: ['most-viewed-profiles', since, limit],
    queryFn: async (): Promise<MostViewedRow[]> => {
      const { data, error } = await supabase.rpc('most_viewed_profiles', { p_since: since, p_limit: limit })
      if (error) throw error
      return ((data ?? []) as MostViewedRow[]).map((row) => ({ ...row, views: Number(row.views), viewers: Number(row.viewers) }))
    },
    staleTime: 60_000,
  })
}
