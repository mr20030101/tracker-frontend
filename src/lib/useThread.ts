import { useLayoutEffect, useMemo, useRef } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { fetchThreadPage, THREAD_PAGE_SIZE } from './messages'
import type { Message } from '../types'

// A conversation's messages, loaded only while it's open and a page at a time: the newest page
// first, older ones on demand through loadOlder(). Sits under the ['messages', myId] key prefix so
// the existing invalidations (send, delete, mark read, the realtime insert) refresh it too.
// Refetching walks the pages again from the newest, each one starting where the last ended, so
// messages arriving mid-session never leave a gap between pages.
export function useThread(myId: string | null, otherUserId: string | null) {
  const query = useInfiniteQuery({
    queryKey: ['messages', myId, 'thread', otherUserId],
    queryFn: ({ pageParam }) => fetchThreadPage(myId!, otherUserId!, pageParam),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => (lastPage.length < THREAD_PAGE_SIZE ? undefined : lastPage[lastPage.length - 1].id),
    enabled: Boolean(myId && otherUserId),
    refetchInterval: 15000,
  })

  // Pages arrive newest-first, each older than the one before; the chat reads oldest-first.
  const messages = useMemo<Message[]>(() => (query.data ? query.data.pages.flat().reverse() : []), [query.data])

  // Older messages are added above what the reader is looking at, which would otherwise shove the
  // view around. Attach scrollRef to the scrolling container and the reader's place is kept.
  const scrollRef = useRef<HTMLDivElement>(null)
  const distanceFromBottom = useRef<number | null>(null)
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el && distanceFromBottom.current !== null) {
      el.scrollTop = el.scrollHeight - distanceFromBottom.current
      distanceFromBottom.current = null
    }
  }, [messages.length])

  function loadOlder() {
    const el = scrollRef.current
    if (el) distanceFromBottom.current = el.scrollHeight - el.scrollTop
    return query.fetchNextPage().then((result) => {
      if (result.isError) distanceFromBottom.current = null
    })
  }

  return {
    messages,
    isLoading: query.isLoading,
    hasOlder: Boolean(query.hasNextPage),
    loadingOlder: query.isFetchingNextPage,
    loadOlder,
    scrollRef,
  }
}
