import { describe, expect, it } from 'vitest'
import { toCsv } from './csv'

const cell = (value: unknown) => toCsv([{ v: value }]).split('\n')[1]

describe('csv formula injection guard', () => {
  it('prefixes = with single quote', () => {
    expect(cell('=SUM(A1:A10)')).toBe("'=SUM(A1:A10)")
  })

  it('prefixes = with single quote; still double-quotes when value contains "', () => {
    expect(cell('=HYPERLINK("http://evil.com","x")')).toBe(`"'=HYPERLINK(""http://evil.com"",""x"")"`)
  })

  it('prefixes + with single quote', () => {
    expect(cell('+1')).toBe("'+1")
  })

  it('prefixes - with single quote', () => {
    expect(cell('-1')).toBe("'-1")
  })

  it('prefixes @ with single quote', () => {
    expect(cell('@user')).toBe("'@user")
  })

  it('prefixes tab-leading value with single quote', () => {
    expect(cell('\tfoo')).toBe("'\tfoo")
  })

  it('prefixes CR-leading value with single quote', () => {
    expect(cell('\rfoo')).toBe('"\'\rfoo"')
  })

  it('quotes value containing bare CR', () => {
    expect(cell('foo\rbar')).toBe('"foo\rbar"')
  })

  it('leaves a plain value unchanged', () => {
    expect(cell('hello world')).toBe('hello world')
  })

  it('does not double-prefix a value already starting with a single quote', () => {
    const out = cell("'already")
    expect(out.startsWith("'already")).toBe(true)
  })
})
