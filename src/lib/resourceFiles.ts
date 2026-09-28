import { supabase } from './api'

const BUCKET = 'resources'

// resources.url keeps the bucket's public-style URL for an uploaded file, as it always has. The
// bucket is private now (see the resources storage policies in schema.sql), so that URL no longer
// opens on its own: it only identifies the file, and resourceFilePath() recovers its path from it.
const PUBLIC_PREFIX = supabase.storage.from(BUCKET).getPublicUrl('').data.publicUrl

/** The storage path of an uploaded resource file, or null for an ordinary link. */
export function resourceFilePath(url: string): string | null {
  if (!url.startsWith(PUBLIC_PREFIX)) return null
  const path = url.slice(PUBLIC_PREFIX.length)
  try {
    return decodeURIComponent(path)
  } catch {
    return path
  }
}

/**
 * Uploads into the project's folder ("general" for a resource with no project), which is what the
 * storage policies check to decide who may read and change it. Returns the URL to save on the row.
 */
export async function uploadResourceFile(file: File, projectId: number | null): Promise<string> {
  const path = `${projectId ?? 'general'}/${crypto.randomUUID()}-${file.name}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file)
  if (error) throw error
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

/** Opens an uploaded resource file in a new tab through a signed URL that expires in a minute. */
export async function openResourceFile(path: string): Promise<void> {
  // Opened before the await, so popup blockers still count it as part of the click.
  const tab = window.open('', '_blank')
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60)
  if (error || !data) {
    tab?.close()
    throw error ?? new Error('Could not open this file.')
  }
  if (tab) {
    tab.opener = null
    tab.location.href = data.signedUrl
  } else {
    window.location.href = data.signedUrl
  }
}
