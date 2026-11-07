import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const ROOT = fileURLToPath(new URL('..', import.meta.url))

export function loadEnv() {
  for (const file of ['.env', '.env.backup']) {
    const path = `${ROOT}${file}`
    if (existsSync(path)) process.loadEnvFile(path)
  }
}

export function requireEnv(...names) {
  const missing = names.filter((n) => !process.env[n])
  if (missing.length) fail(`Missing ${missing.join(', ')} in .env.backup (see .env.example).`)
  return names.map((n) => process.env[n])
}

export function fail(message) {
  console.error(`\n${message}`)
  process.exit(1)
}

const BIN_DIRS = ['/opt/homebrew/opt/libpq/bin', '/opt/homebrew/opt/postgresql@17/bin', '/usr/local/opt/libpq/bin']

function pgBin(name) {
  const found = BIN_DIRS.map((d) => `${d}/${name}`).find(existsSync) ?? name
  let version
  try {
    version = execFileSync(found, ['--version'], { encoding: 'utf8' })
  } catch {
    fail(`${name} not found. Install it with: brew install libpq`)
  }
  if (Number(version.match(/(\d+)\./)?.[1]) < 17) fail(`${name} must be version 17 or newer (found: ${version.trim()}).`)
  return found
}

// The password goes through PGPASSWORD so it never shows up in the process list or an error.
export function connection(dbUrl) {
  let url
  try {
    url = new URL(dbUrl)
  } catch {
    fail('The database URL is not a valid postgresql:// connection string.')
  }
  const password = decodeURIComponent(url.password)
  url.password = ''
  const user = decodeURIComponent(url.username)
  return {
    url: url.toString(),
    env: { ...process.env, PGPASSWORD: password, PGSSLMODE: 'require' },
    projectRef: user.split('.')[1] ?? url.hostname.split('.')[1],
  }
}

export function psql(conn, args, options = {}) {
  return execFileSync(pgBin('psql'), [conn.url, '-X', '-v', 'ON_ERROR_STOP=1', ...args], {
    env: conn.env,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'inherit'],
    ...options,
  })
}

export function query(conn, sql) {
  return psql(conn, ['-At', '-c', sql]).trim()
}

export function pgDump(conn, args) {
  execFileSync(pgBin('pg_dump'), [conn.url, ...args], { env: conn.env, stdio: ['ignore', 'inherit', 'inherit'] })
}

export const COUNTS_SQL = `
select t.table_schema || '.' || t.table_name || ' ' ||
  (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', t.table_schema, t.table_name), false, true, '')))[1]::text
from information_schema.tables t
where t.table_type = 'BASE TABLE'
  and (t.table_schema = 'public' or (t.table_schema, t.table_name) in (('auth', 'users'), ('storage', 'buckets')))
order by 1`
