// Contributors' leaderboards show the top TOP_PLACES, and their own place under them if they're further down.
export const TOP_PLACES = 10

export function topWithMine<T>(list: T[], isMine: (item: T) => boolean): { top: T[]; mine: { item: T; index: number } | null } {
  const index = list.findIndex(isMine)
  return { top: list.slice(0, TOP_PLACES), mine: index >= TOP_PLACES ? { item: list[index], index } : null }
}
