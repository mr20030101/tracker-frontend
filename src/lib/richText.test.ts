// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderRichText, richTextToPlain } from './richText'

describe('renderRichText', () => {
  it('keeps the formatting the editor writes', () => {
    const html = '<h2>Heads up</h2><p><strong>B</strong> <em>I</em> <u>U</u> <s>S</s></p><ul><li><p>one</p></li></ul><ol><li><p>1</p></li></ol><blockquote><p>q</p></blockquote>'
    expect(renderRichText(html)).toBe(html)
  })

  it('keeps an allowed font and size, written the way the app writes them', () => {
    const html = renderRichText('<p><span style="font-family: &quot;Playfair Display&quot;, serif; font-size: 1.25em">Hi</span></p>')
    expect(html).toContain('font-family: &quot;Playfair Display&quot;, Georgia, serif')
    expect(html).toContain('font-size: 1.25em')
  })

  it('drops styles that are not a listed font or size', () => {
    const html = renderRichText('<p><span style="position: fixed; inset: 0; font-family: Papyrus; font-size: 90px">x</span></p>')
    expect(html).toBe('<p><span>x</span></p>')
  })

  it('opens links in a new tab', () => {
    expect(renderRichText('<p><a href="https://meet.google.com/abc">Meet</a></p>')).toBe(
      '<p><a href="https://meet.google.com/abc" target="_blank" rel="noopener noreferrer">Meet</a></p>',
    )
  })

  it('strips scripts, event handlers and javascript: links', () => {
    const html = renderRichText('<p>ok</p><script>alert(1)</script><img src=x onerror=alert(1)><a href="javascript:alert(1)">y</a>')
    expect(html).not.toMatch(/<script|onerror|<img|javascript:/i)
  })

  it('shows older plain-text announcements as before, escaped', () => {
    expect(renderRichText('Meeting at 2PM\nLink: below\n\n<b>not bold</b>')).toBe(
      '<p>Meeting at 2PM<br>Link: below</p><p>&lt;b&gt;not bold&lt;/b&gt;</p>',
    )
  })

  it('keeps extra blank lines in plain text', () => {
    expect(renderRichText('one\n\n\n\ntwo')).toBe('<p>one</p><p></p><p>two</p>')
  })

  it('keeps empty paragraphs and a line break at the end of a paragraph', () => {
    expect(renderRichText('<p>one</p><p></p><p>two<br></p>')).toBe('<p>one</p><p></p><p>two<br><br></p>')
  })
})

describe('richTextToPlain', () => {
  it('searches the words, not the markup', () => {
    expect(richTextToPlain('<p><strong>Calibration</strong> &amp; QA</p>')).toBe('Calibration & QA')
    expect(richTextToPlain('plain <3 text')).toBe('plain <3 text')
  })
})
