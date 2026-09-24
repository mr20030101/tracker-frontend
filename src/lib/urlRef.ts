// Profile and chat URLs carry an email or a user id, which then lands in the address bar, browser
// history, screenshots and shared links. These turn them into opaque tokens for the URL. It is only
// encoding: anyone can reverse it, so it hides the value from casual view and is not a secret —
// access to the data is still decided by the database, never by the URL.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function encodeRef(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  bytes.forEach((b) => {
    binary += String.fromCharCode(b)
  })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// Throws on input that isn't a valid token.
function decodeRef(token: string): string {
  const padded = token.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((token.length + 3) % 4)
  const binary = atob(padded)
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)))
}

export function contributorPath(email: string): string {
  return `/contributors/${encodeRef(email.trim())}`
}

// For when the viewer isn't allowed to know the person's email (a contributor opening a peer).
export function contributorPathById(userId: string): string {
  return `/contributors/${encodeRef(userId)}`
}

export function isUserId(value: string): boolean {
  return UUID.test(value)
}

// Accepts a token from contributorPath() / contributorPathById(), or a plain email or id so links
// made before these were hidden (bookmarks, pasted URLs) keep working. The result is either an
// email or a user id; tell them apart with isUserId().
export function parseContributorRef(ref: string): string {
  let raw = ref
  try {
    raw = decodeURIComponent(ref)
  } catch {
    // Not percent-encoded; use it as given.
  }
  if (raw.includes('@') || UUID.test(raw)) return raw
  try {
    return decodeRef(raw)
  } catch {
    return raw
  }
}

export function messagePath(userId: string): string {
  return `/messages/${encodeRef(userId)}`
}

// Accepts a token from messagePath(), or a plain user id so older links keep working.
export function parseMessageRef(ref: string): string {
  if (UUID.test(ref)) return ref
  try {
    return decodeRef(ref)
  } catch {
    return ref
  }
}
