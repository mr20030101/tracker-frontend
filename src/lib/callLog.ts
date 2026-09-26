import { convertEmoticons } from './emoticons'

// Calls (lib/call) leave a line in the conversation when they end, written by the caller as an
// ordinary message whose body is a small marker, e.g. "[[call:ended:125]]". Keeping it a message
// means it needs nothing new in the database, reaches the other person live, counts as unread for
// a missed call, and shows in the conversation list.

export type CallLog = { outcome: 'missed' | 'declined' } | { outcome: 'ended'; seconds: number }

const PATTERN = /^\[\[call:(missed|declined|ended)(?::(\d+))?\]\]$/

export function callLogBody(log: CallLog): string {
  return log.outcome === 'ended' ? `[[call:ended:${Math.max(0, Math.round(log.seconds))}]]` : `[[call:${log.outcome}]]`
}

export function parseCallLog(body: string): CallLog | null {
  const match = PATTERN.exec(body.trim())
  if (!match) return null
  if (match[1] === 'ended') return { outcome: 'ended', seconds: Number(match[2] ?? 0) }
  return { outcome: match[1] as 'missed' | 'declined' }
}

// "45 sec", "2 min 5 sec", "1 hr 3 min".
export function formatCallDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h) return m ? `${h} hr ${m} min` : `${h} hr`
  if (m) return s ? `${m} min ${s} sec` : `${m} min`
  return `${s} sec`
}

// `mine`: you made the call.
export function callLogTitle(log: CallLog, mine: boolean): string {
  if (log.outcome === 'ended') return 'Voice call'
  if (log.outcome === 'declined') return mine ? 'Call declined' : 'You declined a call'
  return mine ? 'No answer' : 'Missed call'
}

// One line for the conversation list.
export function callLogPreview(log: CallLog, mine: boolean): string {
  return log.outcome === 'ended' ? `📞 Voice call · ${formatCallDuration(log.seconds)}` : `📞 ${callLogTitle(log, mine)}`
}

// The conversation list's preview of a last message: a call line, or the text ("You: ..." if yours).
export function messagePreview(body: string, mine: boolean): string {
  const log = parseCallLog(body)
  if (log) return callLogPreview(log, mine)
  return `${mine ? 'You: ' : ''}${convertEmoticons(body)}`
}
