import { Avatar } from './Avatar'
import { isOnline } from '../lib/presence'

export function AvatarWithStatus({
  name,
  photoUrl,
  size = 36,
  lastSeenAt,
}: {
  name: string
  photoUrl?: string | null
  size?: number
  lastSeenAt: string | null | undefined
}) {
  const dotSize = Math.max(8, Math.round(size * 0.28))
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <Avatar name={name} photoUrl={photoUrl} size={size} />
      {isOnline(lastSeenAt ?? null) && (
        <span
          className="absolute rounded-full border-2 border-white bg-emerald-500"
          style={{ width: dotSize, height: dotSize, right: -1, bottom: -1 }}
        />
      )}
    </div>
  )
}
