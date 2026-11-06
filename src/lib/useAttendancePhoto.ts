import { useEffect, useRef, useState, type RefObject } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchAttendancePhoto } from './attendancePhoto'

/**
 * An attendance photo as an object URL, fetched once per page session and shared by the card's
 * thumbnail and the full-size view. A photo never changes once taken, so it's never re-fetched;
 * the browser also keeps it for a day (see attendancePhotoGate.ts).
 */
export function useAttendancePhoto(ref: string | null | undefined, enabled = true) {
  const { data: blob, error } = useQuery({
    queryKey: ['attendance-photo', ref],
    queryFn: () => fetchAttendancePhoto(ref!),
    enabled: Boolean(ref) && enabled,
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    retry: false,
  })
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!blob) return setUrl(null)
    const objectUrl = URL.createObjectURL(blob)
    setUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [blob])
  return { url, error }
}

/** True once the element has come near the screen, so off-screen cards don't fetch their photo. */
export function useNearScreen<T extends Element>(): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null)
  const [near, setNear] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || near) return
    if (typeof IntersectionObserver === 'undefined') return setNear(true)
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setNear(true)
      },
      { rootMargin: '200px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [near])
  return [ref, near]
}
