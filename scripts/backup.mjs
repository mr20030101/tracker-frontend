// Full copy of the Supabase project, enough to rebuild it in another account with
// `npm run restore`. Needs .env.backup (see .env.example) and pg_dump/psql 17+ (brew install libpq).
//
//   npm run backup   -> backups/<timestamp>/
//
// The folder holds every user's personal data and password hashes. It is git-ignored; keep it
// somewhere private and delete old copies. Attendance photos live in Google Drive, not here.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { COUNTS_SQL, ROOT, connection, loadEnv, pgDump, query, requireEnv } from './db-tools.mjs'

loadEnv()
const [dbUrl, serviceKey] = requireEnv('SUPABASE_DB_URL', 'SUPABASE_SERVICE_ROLE_KEY')
const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
if (!supabaseUrl) requireEnv('SUPABASE_URL')

const conn = connection(dbUrl)
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const dir = `${ROOT}backups/${stamp}`
mkdirSync(`${dir}/storage`, { recursive: true })
const step = (msg) => console.log(`- ${msg}`)

step('extensions')
const extensions = query(conn, `
  select format('create extension if not exists %I with schema %I;', e.extname, n.nspname)
  from pg_extension e join pg_namespace n on n.oid = e.extnamespace
  where e.extname <> 'plpgsql' order by 1`)
writeFileSync(`${dir}/1-extensions.sql`, `${extensions}\n`)

step('schema (tables, functions, policies, grants)')
const schemaFile = `${dir}/2-schema.sql`
pgDump(conn, ['--schema-only', '--no-owner', '--schema=public', '--file', schemaFile])
const schema = readFileSync(schemaFile, 'utf8')
  .split('\n')
  .filter((line) => !/^(CREATE SCHEMA public;|COMMENT ON SCHEMA public )/.test(line))
  .join('\n')
writeFileSync(schemaFile, schema)

step('auth triggers, storage policies and realtime tables')
const extras = query(conn, `
  select pg_get_triggerdef(t.oid) || ';'
  from pg_trigger t
  join pg_proc p on p.oid = t.tgfoid
  join pg_namespace n on n.oid = p.pronamespace
  where not t.tgisinternal and n.nspname = 'public'
    and t.tgrelid in ('auth.users'::regclass, 'storage.objects'::regclass, 'storage.buckets'::regclass)
  union all
  select format('create policy %I on %I.%I as %s for %s to %s%s%s;',
    policyname, schemaname, tablename, permissive, cmd,
    (select string_agg(case when r = 'public' then 'public' else quote_ident(r) end, ', ') from unnest(roles) r),
    coalesce(' using (' || qual || ')', ''),
    coalesce(' with check (' || with_check || ')', ''))
  from pg_policies where schemaname = 'storage'
  union all
  select format('alter publication supabase_realtime add table %I.%I;', schemaname, tablename)
  from pg_publication_tables where pubname = 'supabase_realtime'`)
writeFileSync(`${dir}/3-auth-storage-realtime.sql`, `${extras}\n`)

step('data (public tables and user accounts)')
const skippedAuth = ['schema_migrations', 'audit_log_entries', 'sessions', 'refresh_tokens', 'mfa_amr_claims', 'flow_state', 'one_time_tokens', 'saml_relay_states']
pgDump(conn, [
  '--data-only',
  '--schema=public',
  '--schema=auth',
  ...skippedAuth.map((t) => `--exclude-table=auth.${t}`),
  '--file',
  `${dir}/4-data.sql`,
])
pgDump(conn, ['--data-only', '--table=storage.buckets', '--file', `${dir}/5-buckets.sql`])

step('row counts')
writeFileSync(`${dir}/counts.txt`, `${query(conn, COUNTS_SQL)}\n`)

step('storage files')
const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets()
if (bucketsError) throw bucketsError
const manifest = []

async function walk(bucket, prefix) {
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000, offset })
    if (error) throw error
    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name
      if (item.id === null) {
        await walk(bucket, path)
        continue
      }
      const { data: blob, error: downloadError } = await supabase.storage.from(bucket).download(path)
      if (downloadError) throw downloadError
      const file = `${dir}/storage/${bucket}/${path}`
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, Buffer.from(await blob.arrayBuffer()))
      manifest.push({ bucket, path, contentType: item.metadata?.mimetype ?? blob.type })
    }
    if (data.length < 1000) break
  }
}

for (const bucket of buckets) await walk(bucket.name, '')
writeFileSync(`${dir}/storage/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`)

console.log(`\nBacked up project ${conn.projectRef} to backups/${stamp}`)
console.log(`${manifest.length} files from ${buckets.length} buckets. Row counts are in counts.txt.`)
