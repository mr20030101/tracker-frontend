import { useEffect, useMemo, useReducer } from 'react'
import type { Message } from '../types'

export const BOT_TYPING_MIN_MS = 5000

// The absolute timestamp a bot reply sent in response to `lastMineCreatedAt` should become visible
// at. Exported so messagingContext.tsx's notification sound can be scheduled for the same instant
// the reveal happens here, instead of firing the moment the reply lands in the DB.
export function botRevealAt(lastMineCreatedAt: string): number {
  return new Date(lastMineCreatedAt).getTime() + BOT_TYPING_MIN_MS
}

// Same reveal timestamp, worked out directly from the full cross-conversation message list instead
// of a single 2-person thread — used by messagingContext.tsx so the conversation list preview stays
// in sync with the open chat panel instead of showing a bot reply's text before its bubble appears.
export function botMessageRevealAt(message: Message, allMessages: Message[]): number {
  let priorMine: Message | null = null
  for (const m of allMessages) {
    if (m.sender_id !== message.recipient_id || m.recipient_id !== message.sender_id) continue
    if (new Date(m.created_at).getTime() >= new Date(message.created_at).getTime()) continue
    if (!priorMine || new Date(m.created_at).getTime() > new Date(priorMine.created_at).getTime()) priorMine = m
  }
  return priorMine ? botRevealAt(priorMine.created_at) : new Date(message.created_at).getTime()
}

// The bot's real reply can land in well under a second, which reads as an obviously scripted
// instant response. This holds the already-arrived reply back behind a "typing…" indicator until
// at least BOT_TYPING_MIN_MS has passed since the message that prompted it, then reveals it — if
// the real round trip takes longer than that on its own, the reply just shows the moment it arrives.
export function useBotTyping(thread: Message[], myId: string | null, isOtherBot: boolean) {
  const [, forceTick] = useReducer((c: number) => c + 1, 0)

  const lastMineIndex = myId ? thread.map((m) => m.sender_id).lastIndexOf(myId) : -1
  const hasReplyAfter = lastMineIndex !== -1 && lastMineIndex < thread.length - 1
  const lastMineMessage = lastMineIndex !== -1 ? thread[lastMineIndex] : null

  const revealAt = isOtherBot && hasReplyAfter && lastMineMessage ? botRevealAt(lastMineMessage.created_at) : null
  const withinTypingWindow = revealAt !== null && Date.now() < revealAt

  useEffect(() => {
    if (revealAt === null) return
    const remaining = revealAt - Date.now()
    if (remaining <= 0) return
    const timer = setTimeout(forceTick, remaining)
    return () => clearTimeout(timer)
  }, [revealAt])

  const isTyping = isOtherBot && lastMineIndex !== -1 && (!hasReplyAfter || withinTypingWindow)
  const visibleThread = useMemo(
    () => (isOtherBot && withinTypingWindow ? thread.slice(0, lastMineIndex + 1) : thread),
    [thread, isOtherBot, withinTypingWindow, lastMineIndex],
  )

  return { visibleThread, isTyping }
}
