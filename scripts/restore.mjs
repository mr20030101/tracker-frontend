// Rebuilds a backup from `npm run backup` into a NEW, empty Supabase project.
//
//   npm run restore                      -> newest folder in backups/
//   npm run restore -- backups/<stamp>
//
// Needs TARGET_DB_URL, TARGET_SUPABASE_URL and TARGET_SERVICE_ROLE_KEY in .env.backup. Refuses to
// run against the project the backup came from, or any project that already has tables.

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { COUNTS_SQL, ROOT, connection, fail, loadEnv, psql, query, requireEnv } from './db-tools.mjs'

loadEnv()
const [targetDbUrl, targetUrl, targetKey] = requireEnv('TARGET_DB_URL', 'TARGET_SUPABASE_URL', 'TARGET_SERVICE_ROLE_KEY')

const backupsDir = `${ROOT}backups`
const dir = process.argv[2]
  ? process.argv[2].replace(/\/$/, '')
  : existsSync(backupsDir) && readdirSync(backupsDir).filter((d) => !d.startsWith('.')).sort().map((d) => `${backupsDir}/${d}`).at(-1)
if (!dir || !existsSync(`${dir}/4-data.sql`)) fail('No backup found. Run npm run backup first, or pass the folder.')

const target = connection(targetDbUrl)
if (process.env.SUPABASE_DB_URL && connection(process.env.SUPABASE_DB_URL).projectRef === target.projectRef) {
  fail(`TARGET_DB_URL points at the live project (${target.projectRef}). Restore only into a new project.`)
}
if (!targetUrl.includes(target.projectRef)) fail('TARGET_SUPABASE_URL and TARGET_DB_URL are different projects.')
if (query(target, `select count(*) from pg_tables where schemaname = 'public'`) !== '0') {
  fail(`Project ${target.projectRef} already has tables in public. Restore only into a new, empty project.`)
}

console.log(`Restoring ${dir} into ${target.projectRef}`)
console.log('- database (one transaction: nothing is kept if any step fails)')
psql(target, [
  '--single-transaction',
  '-q',
  '-f', `${dir}/1-extensions.sql`,
  '-f', `${dir}/2-schema.sql`,
  '-f', `${dir}/3-auth-storage-realtime.sql`,
  '-c', 'set session_replication_role = replica',
  '-f', `${dir}/4-data.sql`,
  '-f', `${dir}/5-buckets.sql`,
], { stdio: ['ignore', 'ignore', 'inherit'] })

console.log('- storage files')
const supabase = createClient(targetUrl, targetKey, { auth: { persistSession: false } })
const manifest = JSON.parse(readFileSync(`${dir}/storage/manifest.json`, 'utf8'))
for (const { bucket, path, contentType } of manifest) {
  const body = readFileSync(`${dir}/storage/${bucket}/${path}`)
  const { error } = await supabase.storage.from(bucket).upload(path, body, { contentType, upsert: true })
  if (error) fail(`Upload failed for ${bucket}/${path}: ${error.message}`)
}

console.log('- comparing row counts')
const expected = readFileSync(`${dir}/counts.txt`, 'utf8').trim()
const actual = query(target, COUNTS_SQL)
if (expected !== actual) {
  const actualLines = new Set(actual.split('\n'))
  const diff = expected.split('\n').filter((line) => !actualLines.has(line))
  fail(`Row counts differ from the backup:\n${diff.join('\n')}`)
}

console.log(`\nDone: every table has the same row count as the backup, and ${manifest.length} files are uploaded.`)
console.log('Still to do by hand: see docs/moving-supabase.md.')
