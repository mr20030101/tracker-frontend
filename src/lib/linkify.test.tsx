import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { linkify } from './linkify'

const html = (text: string) => renderToStaticMarkup(<>{linkify(text)}</>)

describe('linkify', () => {
  it('links http(s) addresses and leaves the rest as text', () => {
    expect(html('see https://example.com/a?b=1 now')).toContain('<a href="https://example.com/a?b=1"')
    expect(html('see https://example.com/a?b=1 now')).toMatch(/^see <a .*>https:\/\/example\.com\/a\?b=1<\/a> now$/)
  })

  it('gives a bare www. address https://', () => {
    expect(html('www.example.com')).toContain('href="https://www.example.com"')
  })

  it('drops sentence punctuation after the link', () => {
    expect(html('Go to https://example.com.')).toMatch(/>https:\/\/example\.com<\/a>\.$/)
    expect(html('(https://example.com)')).toMatch(/^\(<a .*>https:\/\/example\.com<\/a>\)$/)
  })

  it('keeps a closing bracket that is part of the URL', () => {
    expect(html('https://en.wikipedia.org/wiki/Owl_(disambiguation)')).toContain('>https://en.wikipedia.org/wiki/Owl_(disambiguation)</a>')
  })

  it('never links other schemes', () => {
    expect(html('javascript:alert(1)')).not.toContain('<a')
    expect(html('data:text/html,hi')).not.toContain('<a')
  })

  it('opens links in a new tab without handing over the opener', () => {
    expect(html('https://example.com')).toContain('target="_blank" rel="noopener noreferrer nofollow"')
  })

  it('handles several links in one message', () => {
    expect(html('a https://x.com b https://y.com c').match(/<a /g)).toHaveLength(2)
  })
})
