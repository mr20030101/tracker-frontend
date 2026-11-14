import type { ReactNode } from 'react'

// Light Markdown for support tickets and replies: **bold**, *italic*, `code`, "- " and "1. "
// lists, and blank-line paragraphs. Built as React elements, so nothing typed becomes HTML.

type Block = { kind: 'p'; lines: string[] } | { kind: 'ul' | 'ol'; items: string[]; start: number }

const BULLET = /^\s*[-*•]\s+(.*)$/
const NUMBERED = /^\s*(\d+)[.)]\s+(.*)$/
const INLINE = /(\*\*[^*\n]+\*\*|`[^`\n]+`|(?<![*\w])\*[^*\s][^*\n]*\*(?!\*))/g

export function parseBlocks(text: string): Block[] {
  const blocks: Block[] = []
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    const last = blocks[blocks.length - 1]
    const bullet = BULLET.exec(line)
    const numbered = NUMBERED.exec(line)
    if (bullet) {
      if (last?.kind === 'ul') last.items.push(bullet[1])
      else blocks.push({ kind: 'ul', items: [bullet[1]], start: 1 })
    } else if (numbered) {
      if (last?.kind === 'ol') last.items.push(numbered[2])
      else blocks.push({ kind: 'ol', items: [numbered[2]], start: Number(numbered[1]) })
    } else if (line.trim() === '') {
      if (last?.kind === 'p') blocks.push({ kind: 'p', lines: [] })
    } else if (last?.kind === 'p') {
      last.lines.push(line)
    } else {
      blocks.push({ kind: 'p', lines: [line] })
    }
  }
  return blocks.filter((b) => b.kind !== 'p' || b.lines.length > 0)
}

export function renderInline(text: string): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2)
      return <code key={i} className="rounded-sm bg-gray-100 px-1 py-px font-mono text-[0.9em]">{part.slice(1, -1)}</code>
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) return <em key={i}>{part.slice(1, -1)}</em>
    return part
  })
}

export function FormattedText({ text, className = '' }: { text: string; className?: string }) {
  return (
    <div className={`space-y-2 wrap-break-word ${className}`}>
      {parseBlocks(text).map((block, i) => {
        if (block.kind === 'p') {
          return (
            <p key={i}>
              {block.lines.map((line, j) => (
                <span key={j}>
                  {j > 0 && <br />}
                  {renderInline(line)}
                </span>
              ))}
            </p>
          )
        }
        const items = block.items.map((item, j) => <li key={j}>{renderInline(item)}</li>)
        return block.kind === 'ul' ? (
          <ul key={i} className="list-disc space-y-0.5 pl-5">{items}</ul>
        ) : (
          <ol key={i} start={block.start} className="list-decimal space-y-0.5 pl-5">{items}</ol>
        )
      })}
    </div>
  )
}
