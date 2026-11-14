import { describe, expect, it } from 'vitest'
import { parseBlocks, renderInline } from './FormattedText'

describe('parseBlocks', () => {
  it('splits paragraphs and lists', () => {
    const text = 'Hi Marjie,\n\n**1. Request a reclaim.**\n\n- Open Submissions.\n- Locate `abc`.\n\nSelect:\n- **Reclaim**\n\n1. One\n2. Two'
    expect(parseBlocks(text)).toEqual([
      { kind: 'p', lines: ['Hi Marjie,'] },
      { kind: 'p', lines: ['**1. Request a reclaim.**'] },
      { kind: 'ul', items: ['Open Submissions.', 'Locate `abc`.'], start: 1 },
      { kind: 'p', lines: ['Select:'] },
      { kind: 'ul', items: ['**Reclaim**'], start: 1 },
      { kind: 'ol', items: ['One', 'Two'], start: 1 },
    ])
  })
})

describe('renderInline', () => {
  it('keeps markup out of plain text and tags bold, italic and code', () => {
    const nodes = renderInline('a **b** *c* `d` <img src=x>')
    const kinds = nodes.map((n) => (typeof n === 'string' ? n : (n as { type: string }).type))
    expect(kinds).toEqual(['a ', 'strong', ' ', 'em', ' ', 'code', ' <img src=x>'])
  })
})
