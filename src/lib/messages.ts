import { supabase } from './api'
import type { Conversation, ConversationSummary, DirectoryUser, Message } from '../types'

export const THREAD_PAGE_SIZE = 30

export async function fetchDirectory(): Promise<DirectoryUser[]> {
  const { data, error } = await supabase.rpc('directory')
  if (error) throw error
  return (data ?? []) as DirectoryUser[]
}

// The inbox: one small row per conversation (unread count + last few messages), computed in the
// database so history never has to be downloaded just to draw the list.
export async function fetchConversationSummaries(): Promise<ConversationSummary[]> {
  const { data, error } = await supabase.rpc('conversation_summaries')
  if (error) throw error
  return ((data ?? []) as ConversationSummary[]).map((s) => ({
    ...s,
    unread_count: Number(s.unread_count),
    recent: s.recent ?? [],
  }))
}

// One page of a two-person thread, newest first: the newest THREAD_PAGE_SIZE messages, or the next
// THREAD_PAGE_SIZE older than `beforeId`. "Delete for me" hides a message from just the viewer who
// deleted it — the other party's copy is untouched — so those are filtered out here.
export async function fetchThreadPage(myId: string, otherUserId: string, beforeId?: number): Promise<Message[]> {
  let query = supabase
    .from('messages')
    .select('*')
    .or(
      `and(sender_id.eq.${myId},recipient_id.eq.${otherUserId},deleted_by_sender.eq.false),` +
        `and(sender_id.eq.${otherUserId},recipient_id.eq.${myId},deleted_by_recipient.eq.false)`,
    )
    .order('id', { ascending: false })
    .limit(THREAD_PAGE_SIZE)
  if (beforeId !== undefined) query = query.lt('id', beforeId)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as Message[]
}

export async function deleteMessageForMe(myId: string, message: Message): Promise<void> {
  const column = message.sender_id === myId ? 'deleted_by_sender' : 'deleted_by_recipient'
  const { error } = await supabase.from('messages').update({ [column]: true }).eq('id', message.id)
  if (error) throw error
}

// Same "delete for me" semantics as deleteMessageForMe, batched into at most 2 requests (one per
// role) instead of one request per message, since a multi-select delete can span both sides of the
// conversation — some rows I sent, some the other person sent.
export async function deleteMessagesForMe(myId: string, messages: Message[]): Promise<void> {
  const sentIds = messages.filter((m) => m.sender_id === myId).map((m) => m.id)
  const receivedIds = messages.filter((m) => m.recipient_id === myId).map((m) => m.id)
  const results = await Promise.all([
    sentIds.length ? supabase.from('messages').update({ deleted_by_sender: true }).in('id', sentIds) : null,
    receivedIds.length ? supabase.from('messages').update({ deleted_by_recipient: true }).in('id', receivedIds) : null,
  ])
  for (const result of results) {
    if (result?.error) throw result.error
  }
}

// Deletes every message in a 2-person thread, for me only — same as selecting the whole thread and
// bulk-deleting, but scoped by the pair directly instead of needing the message list in hand.
export async function deleteConversationForMe(myId: string, otherUserId: string): Promise<void> {
  const results = await Promise.all([
    supabase.from('messages').update({ deleted_by_sender: true }).eq('sender_id', myId).eq('recipient_id', otherUserId),
    supabase.from('messages').update({ deleted_by_recipient: true }).eq('sender_id', otherUserId).eq('recipient_id', myId),
  ])
  for (const result of results) {
    if (result.error) throw result.error
  }
}

// Doesn't ask for the stored row back: when someone spams the bot the database drops the message
// (and has the bot post a reminder instead), so there may be no row to return.
export async function sendMessage(recipientId: string, body: string): Promise<void> {
  const { data: authData } = await supabase.auth.getUser()
  const senderId = authData.user?.id
  if (!senderId) throw new Error('Unauthenticated')
  const { error } = await supabase.from('messages').insert({ sender_id: senderId, recipient_id: recipientId, body })
  if (error) throw error
}

export async function markThreadRead(myId: string, otherUserId: string): Promise<void> {
  const { error } = await supabase
    .from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('recipient_id', myId)
    .eq('sender_id', otherUserId)
    .is('read_at', null)
  if (error) throw error
}

// `messages` is only each conversation's recent tail, so the real unread totals come from
// `unreadByOther` (the database's count); counting `messages` is just the fallback.
export function buildConversations(
  myId: string,
  messages: Message[],
  usersById: Map<string, DirectoryUser>,
  unreadByOther?: Map<string, number>,
): Conversation[] {
  const byOther = new Map<string, Message[]>()
  for (const message of messages) {
    const otherUserId = message.sender_id === myId ? message.recipient_id : message.sender_id
    const list = byOther.get(otherUserId) ?? []
    list.push(message)
    byOther.set(otherUserId, list)
  }

  return [...byOther.entries()]
    .map(([otherUserId, thread]) => {
      const sorted = [...thread].sort((a, b) => a.created_at.localeCompare(b.created_at))
      const lastMessage = sorted[sorted.length - 1]
      const unreadCount = unreadByOther?.get(otherUserId) ?? sorted.filter((m) => m.recipient_id === myId && !m.read_at).length
      const other = usersById.get(otherUserId)
      return {
        otherUserId,
        otherUserName: other?.name ?? 'Unknown',
        otherUserAvatarUrl: other?.avatar_url ?? null,
        lastMessage,
        unreadCount,
      }
    })
    .sort((a, b) => b.lastMessage.created_at.localeCompare(a.lastMessage.created_at))
}
