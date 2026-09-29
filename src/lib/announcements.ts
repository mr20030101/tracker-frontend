import { supabase } from './api'
import type { Announcement, AnnouncementAudience, AnnouncementReader } from '../types'

// Everything the caller may see (the database decides: their own audience, their own posts, or
// everything for an admin), pinned first, then newest.
export async function fetchAnnouncements(): Promise<Announcement[]> {
  const { data, error } = await supabase
    .from('announcements')
    .select('*, author:profiles!announcements_author_id_fkey(id, name, avatar_url)')
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw error
  return (data ?? []) as Announcement[]
}

// Only announcements addressed to the caller count; an admin browsing another team's posts doesn't
// get them as unread.
export async function fetchUnreadAnnouncementCount(): Promise<number> {
  const { data, error } = await supabase.rpc('unread_announcement_count')
  if (error) throw error
  return Number(data ?? 0)
}

export async function markAnnouncementsRead(): Promise<void> {
  const { error } = await supabase.rpc('mark_announcements_read')
  if (error) throw error
}

// Ids of the announcements the caller has already seen, to mark the rest as new on the page.
export async function fetchMyAnnouncementReads(): Promise<Set<number>> {
  const { data, error } = await supabase.from('announcement_reads').select('announcement_id')
  if (error) throw error
  return new Set((data ?? []).map((row) => row.announcement_id as number))
}

export async function fetchAnnouncementReaders(announcementId: number): Promise<AnnouncementReader[]> {
  const { data, error } = await supabase.rpc('announcement_seen_by', { p_announcement_id: announcementId })
  if (error) throw error
  return (data ?? []) as AnnouncementReader[]
}

export interface NewAnnouncement {
  audience: AnnouncementAudience
  team_lead_id: string | null
  project_id: number | null
  title: string
  body: string
  pinned: boolean
}

export async function postAnnouncement(authorId: string, input: NewAnnouncement): Promise<void> {
  const { error } = await supabase.from('announcements').insert({ ...input, author_id: authorId })
  if (error) throw error
}

export async function setAnnouncementPinned(id: number, pinned: boolean): Promise<void> {
  const { error } = await supabase.from('announcements').update({ pinned, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

export async function deleteAnnouncement(id: number): Promise<void> {
  const { error } = await supabase.from('announcements').delete().eq('id', id)
  if (error) throw error
}
