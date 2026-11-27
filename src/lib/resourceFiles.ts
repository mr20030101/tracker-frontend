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
 * The folder a resource's uploaded files go in, which is what the storage policies check to decide
 * who may read and change them: the project's ("general" for a resource with no project), or
 * <project>/<lead> for a resource limited to one lead's team.
 */
export function resourceFolder(projectId: number | null, leadId: string | null): string {
  if (projectId == null) return 'general'
  return leadId ? `${projectId}/${leadId}` : String(projectId)
}

/** The folder part of an uploaded file's path, or null for a file at the top of the bucket. */
export function resourceFileFolder(path: string): string | null {
  const slash = path.lastIndexOf('/')
  return slash > 0 ? path.slice(0, slash) : null
}

/** Uploads into resourceFolder(). Returns the URL to save on the row. */
export async function uploadResourceFile(file: File, projectId: number | null, leadId: string | null): Promise<string> {
  const path = `${resourceFolder(projectId, leadId)}/${crypto.randomUUID()}-${storageSafeName(file.name)}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file)
  if (error) throw new Error(uploadErrorMessage(error))
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

/**
 * A file name storage accepts. It refuses some characters in a path, which failed every upload of,
 * say, a macOS screen recording ("Screen Recording … 10.32.11 AM.mov" has a narrow no-break space
 * before AM). Letters, digits, dot, dash and underscore stay, accents are dropped, the rest become
 * dashes. The resource's title keeps the original name.
 */
export function storageSafeName(name: string): string {
  const dot = name.lastIndexOf('.')
  const [base, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot + 1)] : [name, '']
  const clean = (part: string) =>
    part
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^[-.]+|[-.]+$/g, '')
  const safeBase = clean(base).slice(0, 100) || 'file'
  const safeExt = clean(ext).slice(0, 10)
  return safeExt ? `${safeBase}.${safeExt}` : safeBase
}

/** What went wrong, in words someone can act on. */
function uploadErrorMessage(error: { message?: string; statusCode?: string | number }): string {
  const message = error.message ?? ''
  if (String(error.statusCode) === '413' || /too large|exceeded the maximum|payload/i.test(message)) {
    return 'That file is too big to upload. Try a shorter or smaller video, or upload it somewhere else and paste the link.'
  }
  if (/mime|type .* not supported/i.test(message)) return "That kind of file can't be uploaded here."
  return message ? `Could not upload this file: ${message}` : 'Could not upload this file. Try again.'
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
