// Profile photos live in the public avatars bucket at "<user id>/avatar-<time>.<ext>"; the storage
// policies let each user write only inside their own folder.

/** A new, never-reused path for a user's photo. */
export function newAvatarPath(userId: string, ext: string, now = Date.now()): string {
  return `${userId}/avatar-${now}.${ext}`
}

/** The avatars-bucket path of a stored photo's public URL, or null for any other URL. */
export function avatarPathFromUrl(url: string): string | null {
  const match = /\/storage\/v1\/object\/public\/avatars\/([^?#]+)/.exec(url)
  if (!match) return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    return match[1]
  }
}
