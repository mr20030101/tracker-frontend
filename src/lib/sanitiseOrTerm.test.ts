import { describe, expect, it } from 'vitest'
import { sanitiseOrTerm } from './sanitiseOrTerm'

describe('sanitiseOrTerm', () => {
  it('strips ( and ) which break PostgREST or() grouping', () => {
    expect(sanitiseOrTerm('foo(bar)')).toBe('foobar')
    expect(sanitiseOrTerm('(hello)')).toBe('hello')
    expect(sanitiseOrTerm('a(b(c))')).toBe('abc')
  })

  it('strips , which splits PostgREST or() conditions', () => {
    expect(sanitiseOrTerm('hello, world')).toBe('hello world')
    expect(sanitiseOrTerm('a,b')).toBe('ab')
  })

  it('strips % which is the ilike wildcard', () => {
    expect(sanitiseOrTerm('100%')).toBe('100')
    expect(sanitiseOrTerm('%done%')).toBe('done')
  })

  it('strips " which is a PostgREST quoting delimiter', () => {
    expect(sanitiseOrTerm('"quoted"')).toBe('quoted')
  })

  it('trims leading and trailing whitespace', () => {
    expect(sanitiseOrTerm('  test  ')).toBe('test')
  })

  it('leaves normal search terms unchanged', () => {
    expect(sanitiseOrTerm('user@example.com')).toBe('user@example.com')
    expect(sanitiseOrTerm('TASK-123')).toBe('TASK-123')
    expect(sanitiseOrTerm('hello world')).toBe('hello world')
  })

  it('handles the empty string', () => {
    expect(sanitiseOrTerm('')).toBe('')
    expect(sanitiseOrTerm('   ')).toBe('')
  })
})
