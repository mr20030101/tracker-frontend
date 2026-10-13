import { useEffect, useMemo, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from './api'

// How often "still typing" is re-sent while the box has text, and how long a typing signal lasts
// without one: so a closed tab or a dropped connection clears itself instead of typing forever.
const RESEND_MS = 2_000
const EXPIRES_MS = 5_000

type TypingPayload = { userId: string | null; typing: boolean }

const EMPTY = new Map<string, number>()

// Over the open connection once the channel has joined; before that (the first keystroke can beat
// the join), over plain HTTP, so it isn't lost.
function broadcast(channel: RealtimeChannel, payload: TypingPayload) {
  if (channel.state === 'joined') void channel.send({ type: 'broadcast', event: 'typing', payload })
  else void channel.httpSend('typing', payload)
}

/**
 * Someone's typing inbox: everyone writing to them in a direct chat sends here, and they listen to
 * it once for the whole app (messagingContext), so the conversation list can show it too, not
 * just the open chat.
 */
export function directTypingKey(userId: string): string {
  return `typing:to:${userId}`
}

export function groupTypingKey(groupId: number): string {
  return `typing:group:${groupId}`
}

/**
 * Shares whether you're typing in a chat and returns who else is, over a realtime broadcast (no
 * database rows). You count as typing while `draft` has text; emptying it (sending, or clearing
 * the box) stops it straight away. Pass a null key to turn it off, e.g. in a chat with the bot.
 * `listen: false` only sends (into someone else's typing inbox; see directTypingKey). One hook per
 * key: supabase hands back the same channel for the same name, so two would unsubscribe each other.
 */
export function useTypingIndicator(
  key: string | null,
  myId: string | null,
  draft: string,
  { listen = true }: { listen?: boolean } = {},
): string[] {
  const channelRef = useRef<RealtimeChannel | null>(null)
  const lastSentRef = useRef(0)
  // Who's typing (and until when), tagged with the chat it's for, so switching chats starts empty.
  const [state, setState] = useState<{ key: string | null; typers: Map<string, number> }>({ key, typers: new Map() })
  const typers = state.key === key ? state.typers : EMPTY

  useEffect(() => {
    if (!key || !myId) return
    const channel = supabase.channel(key, { config: { broadcast: { self: false } } })
    if (listen) channel.on('broadcast', { event: 'typing' }, ({ payload }) => {
      const { userId, typing } = payload as TypingPayload
      if (!userId || userId === myId) return
      setState((prev) => {
        const next = new Map(prev.key === key ? prev.typers : EMPTY)
        if (typing) next.set(userId, Date.now() + EXPIRES_MS)
        else next.delete(userId)
        return { key, typers: next }
      })
    })
    channel.subscribe()
    channelRef.current = channel
    return () => {
      // Leaving the chat mid-message stops your typing there.
      if (lastSentRef.current !== 0) broadcast(channel, { userId: myId, typing: false })
      lastSentRef.current = 0
      channelRef.current = null
      void supabase.removeChannel(channel)
    }
  }, [key, myId, listen])

  // Drops anyone whose last signal has run out.
  useEffect(() => {
    if (typers.size === 0) return
    const nextExpiry = Math.min(...typers.values())
    const timer = setTimeout(() => {
      const now = Date.now()
      setState((prev) => ({ key: prev.key, typers: new Map([...prev.typers].filter(([, expiresAt]) => expiresAt > now)) }))
    }, Math.max(0, nextExpiry - Date.now()) + 50)
    return () => clearTimeout(timer)
  }, [typers])

  // Sends "typing" on the first keystroke and then at most every RESEND_MS, and "stopped" once
  // the box empties or the chat closes.
  const isTyping = draft.trim() !== ''
  useEffect(() => {
    const send = (typing: boolean) => {
      if (channelRef.current) broadcast(channelRef.current, { userId: myId, typing })
    }
    if (!isTyping) {
      if (lastSentRef.current !== 0) send(false)
      lastSentRef.current = 0
      return
    }
    if (Date.now() - lastSentRef.current >= RESEND_MS) {
      send(true)
      lastSentRef.current = Date.now()
    }
  }, [draft, isTyping, myId])
  return useMemo(() => [...typers.keys()], [typers])
}
