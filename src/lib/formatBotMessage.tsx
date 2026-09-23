import { Fragment, type ReactNode } from 'react'
import { convertEmoticons } from './emoticons'

// Not a full markdown parser — just the handful of patterns the bot's system prompt asks it to use
// (**bold**, "- "/"• " bullets, "1. " numbered lists), rendered as real React elements rather than
// dangerouslySetInnerHTML so there's no HTML-injection surface for whatever Groq returns. Anything
// else is shown as plain text.
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const parts = convertEmoticons(text).split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
      <strong key={`${keyPrefix}-${i}`}>{part.slice(2, -2)}</strong>
    ) : (
      <Fragment key={`${keyPrefix}-${i}`}>{part}</Fragment>
    ),
  )
}

export function formatBotMessage(body: string): ReactNode {
  const blocks: ReactNode[] = []
  let list: { type: 'ul' | 'ol'; items: string[] } | null = null

  const flushList = () => {
    if (!list) return
    const { type, items } = list
    const ListTag = type
    blocks.push(
      <ListTag key={`list-${blocks.length}`} className={type === 'ul' ? 'list-disc pl-4' : 'list-decimal pl-4'}>
        {items.map((item, i) => (
          <li key={i}>{renderInline(item, `li-${blocks.length}-${i}`)}</li>
        ))}
      </ListTag>,
    )
    list = null
  }

  for (const line of body.split('\n')) {
    const bullet = line.match(/^[-•]\s+(.*)/)
    const numbered = line.match(/^\d+\.\s+(.*)/)
    if (bullet) {
      if (!list || list.type !== 'ul') {
        flushList()
        list = { type: 'ul', items: [] }
      }
      list.items.push(bullet[1])
    } else if (numbered) {
      if (!list || list.type !== 'ol') {
        flushList()
        list = { type: 'ol', items: [] }
      }
      list.items.push(numbered[1])
    } else {
      flushList()
      if (line.trim() !== '') blocks.push(<div key={`p-${blocks.length}`}>{renderInline(line, `p-${blocks.length}`)}</div>)
    }
  }
  flushList()

  return <div className="flex flex-col gap-1">{blocks}</div>
}
