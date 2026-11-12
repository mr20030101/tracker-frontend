import { describe, expect, it } from 'vitest'
import { matchCandidates, mentionQueryAt } from './mentions'

describe('mentionQueryAt', () => {
  it('finds the @query before the caret', () => {
    expect(mentionQueryAt('hi @Ja', 6)).toEqual({ start: 3, query: 'Ja' })
    expect(mentionQueryAt('@', 1)).toEqual({ start: 0, query: '' })
    expect(mentionQueryAt('@Jay Anne', 9)).toEqual({ start: 0, query: 'Jay Anne' })
  })

  it('ignores an @ inside a word, such as an email address', () => {
    expect(mentionQueryAt('mail me at cb@example.com', 25)).toBeNull()
    expect(mentionQueryAt('no mention here', 15)).toBeNull()
  })
})

describe('matchCandidates', () => {
  const people = [
    { id: '1', name: 'Jay Anne Tan' },
    { id: '2', name: 'Ina Cruz' },
  ]
  it('matches the start of any part of the name', () => {
    expect(matchCandidates(people, 'an').map((c) => c.id)).toEqual(['1'])
    expect(matchCandidates(people, 'cr').map((c) => c.id)).toEqual(['2'])
    expect(matchCandidates(people, '').map((c) => c.id)).toEqual(['1', '2'])
  })
})
