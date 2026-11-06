import { Avatar } from './Avatar'
import { useAttendancePhoto, useNearScreen } from '../lib/useAttendancePhoto'

/** The day's attendance photo as the person's picture, or their usual avatar until it loads or when there's none. */
export function AttendanceAvatar({
  name,
  avatarUrl,
  photoRef,
  size = 40,
}: {
  name: string
  avatarUrl: string | null
  photoRef: string | null | undefined
  size?: number
}) {
  const [ref, near] = useNearScreen<HTMLSpanElement>()
  const { url } = useAttendancePhoto(photoRef, near)
  return (
    <span ref={ref} className="shrink-0">
      <Avatar name={name} photoUrl={url ?? avatarUrl} size={size} />
    </span>
  )
}
