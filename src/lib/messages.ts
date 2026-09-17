import { supabase } from './api'
import type { Conversation, DirectoryUser, Message } from '../types'

export async function fetchDirectory(): Promise<DirectoryUser[]> {
  const { data, error } = await supabase.rpc('directory')
  if (error) throw error
  return (data ?? []) as DirectoryUser[]
}

export async function fetchAllMessages(myId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .or(`sender_id.eq.${myId},recipient_id.eq.${myId}`)
    .order('created_at', { ascending: true })
  if (error) throw error
  // "Delete for me" hides a message from just the viewer who deleted it —
  // the other party's copy is untouched.
  return ((data ?? []) as Message[]).filter(
    (m) => !((m.sender_id === myId && m.deleted_by_sender) || (m.recipient_id === myId && m.deleted_by_recipient)),
  )
}

export async function deleteMessageForMe(myId: string, message: Message): Promise<void> {
  const column = message.sender_id === myId ? 'deleted_by_sender' : 'deleted_by_recipient'
  const { error } = await supabase.from('messages').update({ [column]: true }).eq('id', message.id)
  if (error) throw error
}

export async function sendMessage(recipientId: string, body: string): Promise<Message> {
  const { data: authData } = await supabase.auth.getUser()
  const senderId = authData.user?.id
  if (!senderId) throw new Error('Unauthenticated')
  const { data, error } = await supabase
    .from('messages')
    .insert({ sender_id: senderId, recipient_id: recipientId, body })
    .select()
    .single()
  if (error) throw error
  return data as Message
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

export function buildConversations(myId: string, messages: Message[], usersById: Map<string, DirectoryUser>): Conversation[] {
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
      const unreadCount = sorted.filter((m) => m.recipient_id === myId && !m.read_at).length
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
