export const ONLINE_THRESHOLD_MS = 3 * 60 * 1000

export function isOnline(lastSeenAt: string | null): boolean {
  return Boolean(lastSeenAt) && Date.now() - new Date(lastSeenAt!).getTime() < ONLINE_THRESHOLD_MS
}
