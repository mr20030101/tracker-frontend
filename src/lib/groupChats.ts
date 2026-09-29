import { supabase } from './api'
import type { ChatGroupSummary, GroupMessage } from '../types'

export const GROUP_PAGE_SIZE = 30

export function groupPath(groupId: number): string {
  return `/messages/group/${groupId}`
}

export async function fetchGroupSummaries(): Promise<ChatGroupSummary[]> {
  const { data, error } = await supabase.rpc('chat_group_summaries')
  if (error) throw error
  return ((data ?? []) as ChatGroupSummary[])
    .map((g) => ({ ...g, unread_count: Number(g.unread_count), members: g.members ?? [] }))
    .sort((a, b) => (b.last_message?.created_at ?? b.created_at).localeCompare(a.last_message?.created_at ?? a.created_at))
}

// One page of a group's messages, newest first, older than `beforeId` when given (same paging as
// fetchThreadPage for direct messages).
export async function fetchGroupPage(groupId: number, beforeId?: number): Promise<GroupMessage[]> {
  let query = supabase.from('group_messages').select('*').eq('group_id', groupId).order('id', { ascending: false }).limit(GROUP_PAGE_SIZE)
  if (beforeId !== undefined) query = query.lt('id', beforeId)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as GroupMessage[]
}

export async function sendGroupMessage(groupId: number, senderId: string, body: string): Promise<void> {
  const { error } = await supabase.from('group_messages').insert({ group_id: groupId, sender_id: senderId, body })
  if (error) throw error
}

export async function markGroupRead(groupId: number): Promise<void> {
  const { error } = await supabase.rpc('mark_chat_group_read', { p_group_id: groupId })
  if (error) throw error
}

export async function createGroup(name: string, memberIds: string[]): Promise<number> {
  const { data, error } = await supabase.rpc('create_chat_group', { p_name: name, p_member_ids: memberIds })
  if (error) throw error
  return Number(data)
}

export async function addGroupMembers(groupId: number, memberIds: string[]): Promise<void> {
  const { error } = await supabase.rpc('add_chat_group_members', { p_group_id: groupId, p_member_ids: memberIds })
  if (error) throw error
}

// Removing yourself is leaving the group.
export async function removeGroupMember(groupId: number, userId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_chat_group_member', { p_group_id: groupId, p_user_id: userId })
  if (error) throw error
}

export async function renameGroup(groupId: number, name: string): Promise<void> {
  const { error } = await supabase.rpc('rename_chat_group', { p_group_id: groupId, p_name: name })
  if (error) throw error
}

export async function deleteGroup(groupId: number): Promise<void> {
  const { error } = await supabase.rpc('delete_chat_group', { p_group_id: groupId })
  if (error) throw error
}
