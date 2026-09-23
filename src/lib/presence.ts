export const ONLINE_THRESHOLD_MS = 3 * 60 * 1000

export function isOnline(lastSeenAt: string | null): boolean {
  return Boolean(lastSeenAt) && Date.now() - new Date(lastSeenAt!).getTime() < ONLINE_THRESHOLD_MS
}

// "Active now" / "Active 5m ago" style status line for messaging headers, mirroring the phrasing
// chat apps use next to a contact's name — distinct from formatLastSeen in Users.tsx, which is
// worded for an admin roster table ("Never signed in", no "Active" prefix).
export function formatActiveStatus(lastSeenAt: string | null): string {
  if (!lastSeenAt) return 'Offline'
  if (isOnline(lastSeenAt)) return 'Active now'
  const minutes = Math.floor((Date.now() - new Date(lastSeenAt).getTime()) / 60_000)
  if (minutes < 60) return `Active ${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Active ${hours}h ago`
  return `Active ${Math.floor(hours / 24)}d ago`
}
