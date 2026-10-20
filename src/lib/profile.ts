import { supabase } from './api'
import type { User } from '../types'
import { avatarPathFromUrl, newAvatarPath } from './avatarPath'

// Avatars are shown at 80px at most, so a 256px copy stays sharp even on 3x screens.
const AVATAR_EDGE = 256

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))

/**
 * Crops a photo to a centred square and shrinks it to AVATAR_EDGE, as WebP (JPEG in browsers
 * that can't encode WebP, i.e. Safari). A phone photo goes from a few MB to about 10-20 KB.
 */
async function shrinkAvatar(file: File): Promise<{ blob: Blob; ext: string; mime: string }> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error("That photo couldn't be read. Try a PNG, JPEG or WebP image.")
  }
  try {
    const side = Math.min(bitmap.width, bitmap.height)
    const edge = Math.min(AVATAR_EDGE, side)
    const canvas = document.createElement('canvas')
    canvas.width = edge
    canvas.height = edge
    const ctx = canvas.getContext('2d')!
    ctx.imageSmoothingQuality = 'high'
    ctx.fillStyle = '#fff' // JPEG has no transparency
    ctx.fillRect(0, 0, edge, edge)
    ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, edge, edge)
    const webp = await toBlob(canvas, 'image/webp', 0.85)
    if (webp?.type === 'image/webp') return { blob: webp, ext: 'webp', mime: 'image/webp' }
    const jpeg = await toBlob(canvas, 'image/jpeg', 0.85)
    if (!jpeg) throw new Error("Your browser couldn't process that photo.")
    return { blob: jpeg, ext: 'jpg', mime: 'image/jpeg' }
  } finally {
    bitmap.close()
  }
}

/**
 * Uploads a shrunk copy of the photo under a new file name and returns its public URL. A new name
 * every time means the file at a URL never changes, so browsers and the CDN can keep it for good.
 */
export async function uploadAvatar(userId: string, file: File): Promise<string> {
  const { blob, ext, mime } = await shrinkAvatar(file)
  const path = newAvatarPath(userId, ext)
  const { error: uploadError } = await supabase.storage.from('avatars').upload(path, blob, {
    contentType: mime,
    cacheControl: '31536000',
  })
  if (uploadError) throw uploadError
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl
}

/** Removes a replaced photo from storage. Best effort: a leftover file only takes up space. */
export async function removeAvatarFile(url: string | null | undefined): Promise<void> {
  const path = url ? avatarPathFromUrl(url) : null
  if (path) await supabase.storage.from('avatars').remove([path]).catch(() => {})
}

export async function updateOwnProfile(
  name: string,
  avatarUrl: string | null,
  remotasksId: string,
  shift: string,
  bio: string,
): Promise<User> {
  const { data, error } = await supabase.rpc('update_own_profile', {
    new_name: name,
    new_avatar_url: avatarUrl,
    new_remotasks_id: remotasksId,
    new_shift: shift,
    new_bio: bio,
  })
  if (error) throw error
  return data as User
}

export async function clearMustChangePassword(): Promise<void> {
  const { error } = await supabase.rpc('clear_must_change_password')
  if (error) throw error
}

/** Sets just the caller's own Remotasks ID; the database rejects anything that isn't a valid one. */
export async function setOwnRemotasksId(remotasksId: string): Promise<void> {
  const { error } = await supabase.rpc('set_own_remotasks_id', { new_remotasks_id: remotasksId })
  if (error) throw error
}
