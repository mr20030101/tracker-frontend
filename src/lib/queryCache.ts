// Long caching for pages whose numbers don't need to be live, like a contributor's Leaderboard:
// what's loaded is reused for 10 minutes, kept for 30, and not refetched on tab switches or
// revisits, so browsing back and forth costs the server nothing.
export const LONG_CACHE = {
  staleTime: 10 * 60_000,
  gcTime: 30 * 60_000,
  refetchOnWindowFocus: false,
  refetchOnMount: false,
  refetchInterval: false,
} as const

export type CacheOptions = Partial<typeof LONG_CACHE>
