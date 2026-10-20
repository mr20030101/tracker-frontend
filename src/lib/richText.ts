import DOMPurify from 'dompurify'

// Announcement bodies are stored as HTML written by RichTextEditor, and shown through
// renderRichText(), which only lets through the tags and styles below. Bodies from before the
// editor (and the reward announcements written in SQL) are plain text, and still read the same.

/** The fonts the editor offers. `value` is the CSS font-family it writes into a span's style. */
export const FONTS = [
  { label: 'Default', value: '' },
  { label: 'Serif', value: 'Merriweather, Georgia, serif' },
  { label: 'Elegant', value: '"Playfair Display", Georgia, serif' },
  { label: 'Modern', value: 'Montserrat, Roboto, sans-serif' },
  { label: 'Condensed', value: 'Oswald, "Arial Narrow", sans-serif' },
  { label: 'Handwritten', value: 'Caveat, "Comic Sans MS", cursive' },
  { label: 'Monospace', value: '"Roboto Mono", monospace' },
]

/** Relative sizes, so a body still scales with the text around it. */
export const FONT_SIZES = [
  { label: 'Small', value: '0.875em' },
  { label: 'Normal', value: '' },
  { label: 'Large', value: '1.25em' },
  { label: 'Huge', value: '1.75em' },
]

// The extra Google Fonts behind FONTS (Roboto and Roboto Mono already load in index.html). Added
// only where announcements are read or written, and the browser downloads a font's files only
// once some text actually uses it.
const FONTS_STYLESHEET =
  'https://fonts.googleapis.com/css2?family=Caveat:wght@400..700&family=Merriweather:wght@400;700&family=Montserrat:wght@400..700&family=Oswald:wght@400..700&family=Playfair+Display:wght@400..700&display=swap'

export function loadRichTextFonts() {
  if (document.getElementById('rich-text-fonts')) return
  const link = document.createElement('link')
  link.id = 'rich-text-fonts'
  link.rel = 'stylesheet'
  link.href = FONTS_STYLESHEET
  document.head.appendChild(link)
}

// The first family named, unquoted and lowercased: how a style is matched to FONTS whatever
// quoting the browser or editor used when writing it.
const firstFamily = (fontFamily: string) => fontFamily.split(',')[0].replace(/["']/g, '').trim().toLowerCase()
const FONT_BY_FAMILY = new Map(FONTS.filter((f) => f.value).map((f) => [firstFamily(f.value), f.value]))
const ALLOWED_SIZES = new Set(FONT_SIZES.map((s) => s.value).filter(Boolean))

const ALLOWED_TAGS = ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'del', 'a', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote', 'hr', 'span']

let hooksAdded = false

// A span's style is rebuilt from the allowed font and size only, so a hand-crafted body can't
// position, hide or restyle anything else on the page. Links always open in a new tab.
function addHooks() {
  if (hooksAdded) return
  hooksAdded = true
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank')
      node.setAttribute('rel', 'noopener noreferrer')
    }
    if (!(node instanceof HTMLElement) || !node.hasAttribute('style')) return
    const font = node.tagName === 'SPAN' ? FONT_BY_FAMILY.get(firstFamily(node.style.fontFamily)) : undefined
    const size = node.tagName === 'SPAN' && ALLOWED_SIZES.has(node.style.fontSize) ? node.style.fontSize : undefined
    node.removeAttribute('style')
    if (font) node.style.fontFamily = font
    if (size) node.style.fontSize = size
  })
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const isHtml = (body: string) => body.trimStart().startsWith('<')

/** An announcement body as sanitized HTML, safe for dangerouslySetInnerHTML. */
export function renderRichText(body: string): string {
  if (!isHtml(body)) {
    // Plain text: a blank line splits paragraphs, and each extra one stays as an empty paragraph
    // (shown as a blank line), so spacing isn't squeezed out. Single line breaks stay as breaks.
    return body
      .trim()
      .split(/\n\n/)
      .map((para) => `<p>${escapeHtml(para).replace(/\n/g, '<br>')}</p>`)
      .join('')
  }
  addHooks()
  return (
    DOMPurify.sanitize(body, { ALLOWED_TAGS, ALLOWED_ATTR: ['href', 'target', 'rel', 'style', 'start'] })
      // A line break (Shift+Enter) at the very end of a block needs a second one to show as a new line.
      .replace(/<br>(?=<\/(?:p|li|h2|h3)>)/g, '<br><br>')
  )
}

/** The words of a body without its markup, for search. */
export function richTextToPlain(body: string): string {
  if (!isHtml(body)) return body
  return body
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}
