// One-off: shrinks profile photos uploaded before they were resized on upload (full-size phone
// photos, often several MB, shown as 24-80px circles) to 256px WebP under a new file name with a
// one-year cache, points the profile at it and deletes the old file. Files no profile uses are
// listed, and deleted with --delete-orphans.
//
// Dry run by default; nothing changes without --apply. Needs the service role key:
//
//   npm i --no-save sharp
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=... node scripts/shrink-avatars.mjs [--apply] [--delete-orphans]
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'

const EDGE = 256
const BUCKET = 'avatars'
const apply = process.argv.includes('--apply')
const deleteOrphans = process.argv.includes('--delete-orphans')

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}
const admin = createClient(url, key, { auth: { persistSession: false } })
const kb = (n) => `${Math.round(n / 1024)} KB`

const pathOf = (u) => {
  const m = /\/storage\/v1\/object\/public\/avatars\/([^?#]+)/.exec(u ?? '')
  return m ? decodeURIComponent(m[1]) : null
}

// Every stored photo, by path.
const stored = new Map()
const { data: folders, error: listError } = await admin.storage.from(BUCKET).list('', { limit: 1000 })
if (listError) throw listError
for (const folder of folders) {
  const { data: files, error } = await admin.storage.from(BUCKET).list(folder.name, { limit: 1000 })
  if (error) throw error
  for (const f of files) stored.set(`${folder.name}/${f.name}`, f.metadata?.size ?? 0)
}

const { data: profiles, error: profileError } = await admin
  .from('profiles').select('id, name, avatar_url').not('avatar_url', 'is', null)
if (profileError) throw profileError

let before = 0
let after = 0
const used = new Set()
for (const p of profiles) {
  const path = pathOf(p.avatar_url)
  if (!path) continue
  used.add(path)
  if (!path.startsWith(`${p.id}/`)) continue
  const size = stored.get(path)
  if (size === undefined) {
    console.log(`missing  ${p.name}: ${path}`)
    continue
  }
  if (size <= 40 * 1024 && path.endsWith('.webp')) continue // already small

  const { data: file, error } = await admin.storage.from(BUCKET).download(path)
  if (error) {
    console.log(`skip     ${p.name}: ${error.message}`)
    continue
  }
  const out = await sharp(Buffer.from(await file.arrayBuffer()))
    .rotate() // honour the phone's orientation before EXIF is dropped
    .resize(EDGE, EDGE, { fit: 'cover', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .webp({ quality: 85 })
    .toBuffer()
  before += size
  after += out.length
  console.log(`${apply ? 'shrink ' : 'would  '}  ${p.name}: ${path} ${kb(size)} -> ${kb(out.length)}`)
  if (!apply) continue

  const next = `${p.id}/avatar-${Date.now()}.webp`
  const { error: upError } = await admin.storage.from(BUCKET)
    .upload(next, out, { contentType: 'image/webp', cacheControl: '31536000' })
  if (upError) {
    console.log(`  upload failed: ${upError.message}`)
    continue
  }
  const nextUrl = admin.storage.from(BUCKET).getPublicUrl(next).data.publicUrl
  const { error: updateError } = await admin.from('profiles').update({ avatar_url: nextUrl }).eq('id', p.id)
  if (updateError) {
    console.log(`  profile update failed: ${updateError.message}`)
    await admin.storage.from(BUCKET).remove([next])
    continue
  }
  used.delete(path)
  stored.delete(path)
  await admin.storage.from(BUCKET).remove([path])
}

const orphans = [...stored.keys()].filter((p) => !used.has(p))
const orphanBytes = orphans.reduce((sum, p) => sum + stored.get(p), 0)
for (const p of orphans) console.log(`orphan   ${p} ${kb(stored.get(p))}`)
if (orphans.length && deleteOrphans && apply) {
  const { error } = await admin.storage.from(BUCKET).remove(orphans)
  console.log(error ? `orphan delete failed: ${error.message}` : `deleted ${orphans.length} orphans`)
}

console.log(`\n${apply ? 'Shrunk' : 'Would shrink'}: ${kb(before)} -> ${kb(after)}. Orphans: ${orphans.length} (${kb(orphanBytes)}).`)
if (!apply) console.log('Dry run: nothing changed. Add --apply to do it.')
