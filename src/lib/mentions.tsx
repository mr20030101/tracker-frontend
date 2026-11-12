import { Fragment, type ReactNode } from 'react'
import { convertEmoticons } from './emoticons'
import { linkify } from './linkify'

export interface MentionCandidate {
  id: string
  name: string
  avatar_url?: string | null
}

/** The "@query" being typed just before the caret, or null when the caret isn't in one. */
export function mentionQueryAt(text: string, caret: number): { start: number; query: string } | null {
  const match = text.slice(0, caret).match(/(?:^|\s)@([^\n@]{0,30})$/)
  if (!match) return null
  const query = match[1]
  return { start: caret - query.length - 1, query }
}

export function matchCandidates(candidates: MentionCandidate[], query: string): MentionCandidate[] {
  const term = query.trim().toLowerCase()
  return candidates
    .filter((c) => !term || c.name.toLowerCase().startsWith(term) || c.name.toLowerCase().split(/\s+/).some((part) => part.startsWith(term)))
    .slice(0, 6)
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Message text with "@Full Name" of anyone in `names` shown as a mention (stronger when it's you),
 * links made clickable and emoticons turned into emoji. Longest names first, so "@Ana Cruz" wins
 * over "@Ana".
 */
export function renderChatText(body: string, names: string[], myName?: string | null, onAccent = false): ReactNode[] {
  const text = convertEmoticons(body)
  const known = [...new Set(names.filter(Boolean))].sort((a, b) => b.length - a.length)
  if (known.length === 0 || !text.includes('@')) return linkify(text)
  const pattern = new RegExp(`(^|\\s)@(${known.map(escape).join('|')})(?![\\p{L}\\p{N}])`, 'giu')
  const out: ReactNode[] = []
  let last = 0
  for (const match of text.matchAll(pattern)) {
    const start = (match.index ?? 0) + match[1].length
    if (start > last) out.push(...linkify(text.slice(last, start), `m${last}`))
    const isMe = Boolean(myName) && match[2].toLowerCase() === myName!.toLowerCase()
    const tone = onAccent
      ? isMe
        ? 'rounded bg-accent-foreground/25 px-0.5 font-semibold'
        : 'font-semibold underline decoration-accent-foreground/50 underline-offset-2'
      : isMe
        ? 'rounded bg-accent-bg px-0.5 font-semibold text-accent-on-bg'
        : 'font-semibold text-accent-text'
    out.push(
      <span key={`mention-${start}`} className={tone}>
        @{match[2]}
      </span>,
    )
    last = start + match[2].length + 1
  }
  if (last < text.length) out.push(<Fragment key={`m-rest-${last}`}>{linkify(text.slice(last), `m${last}`)}</Fragment>)
  return out
}
