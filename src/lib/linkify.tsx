import { Fragment, type ReactNode } from 'react'

// http(s) links, and bare www. addresses. Stops at whitespace and at characters that can't end a URL here.
const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi
// Punctuation that usually ends the sentence rather than the link ("see https://x.com.").
const TRAILING = /[.,!?;:)\]}'"]+$/

/**
 * Message text with its web addresses turned into links that open in a new tab. Only http(s) links
 * are made (a bare www. address gets https://), so a typed "javascript:" can never become one.
 */
export function linkify(text: string, keyPrefix = 'link', linkClassName = 'underline underline-offset-2 break-all'): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0
    let url = match[0]
    // Keep a closing bracket that belongs to the URL, e.g. a Wikipedia "(disambiguation)" link.
    const trailing = url.match(TRAILING)?.[0] ?? ''
    let cut = trailing.length
    if (trailing.startsWith(')') && (url.match(/\(/g)?.length ?? 0) >= (url.match(/\)/g)?.length ?? 0)) cut = trailing.length - 1
    if (cut > 0) url = url.slice(0, -cut)
    if (start > last) out.push(<Fragment key={`${keyPrefix}-t${start}`}>{text.slice(last, start)}</Fragment>)
    const href = /^https?:\/\//i.test(url) ? url : `https://${url}`
    out.push(
      <a
        key={`${keyPrefix}-a${start}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer nofollow"
        onClick={(e) => e.stopPropagation()}
        className={linkClassName}
      >
        {url}
      </a>,
    )
    last = start + url.length
  }
  if (last < text.length) out.push(<Fragment key={`${keyPrefix}-t${last}`}>{text.slice(last)}</Fragment>)
  return out
}
