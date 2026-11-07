# Moving to another Supabase project

## Back up

1. `brew install libpq` (once; gives `pg_dump` and `psql`).
2. Create `.env.backup` in the repo root with `SUPABASE_DB_URL` and `SUPABASE_SERVICE_ROLE_KEY` (see `.env.example`).
3. `npm run backup` → `backups/<timestamp>/`.

What's in the folder:

| File | Holds |
|---|---|
| `1-extensions.sql` | Postgres extensions in use |
| `2-schema.sql` | Every table, view, function, RLS policy and grant in `public` |
| `3-auth-storage-realtime.sql` | Triggers on `auth.users`, storage policies, the tables realtime listens to |
| `4-data.sql` | All rows in `public`, plus user accounts (`auth.users`, `auth.identities`) with password hashes |
| `5-buckets.sql` | Storage bucket settings |
| `storage/` | Every uploaded file (avatars, resources) and `manifest.json` |
| `counts.txt` | Row count per table, used to check the restore |

Not included:
- Login sessions: everyone signs in again after a move.
- Audit logs.
- Attendance photos: these are in Google Drive and stay there.

The folder holds personal data and password hashes. Keep it private and delete old copies.

## Restore into the new project

1. Create the new Supabase project. Use the same Postgres major version (17) or newer.
2. Add `TARGET_DB_URL`, `TARGET_SUPABASE_URL` and `TARGET_SERVICE_ROLE_KEY` for the new project to `.env.backup`.
3. `npm run restore` (newest backup), or `npm run restore -- backups/<timestamp>`. The database part runs in one transaction. The script stops if the row counts don't match the backup.

## Then, by hand

- [ ] **Edge functions:** `supabase link --project-ref <new ref>`, then `supabase functions deploy`.
- [ ] **Edge function secrets:** `supabase secrets set …` for `BOT_WEBHOOK_SECRET`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_ANALYTICS_API_TOKEN`, `CLOUDFLARE_TURN_API_TOKEN`, `CLOUDFLARE_TURN_KEY_ID`, `GROQ_API_KEY`, `MAIL_FROM_EMAIL`, `MAIL_FROM_NAME`, `RESEND_API_KEY`, `SITE_URL`, `VOICE_RELAY_LIMIT_GB`.
- [ ] **Auth settings:**
  - Site URL and redirect URLs.
  - SMTP.
  - Email templates (copy from `supabase/email-templates/`).
  - Signup and rate-limit settings, to match the old project.
- [ ] **Vercel env:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`, then redeploy.
- [ ] **Hard-coded project URL and key:**
  - `DEFAULT_SUPABASE_URL` and the anon key in `src/lib/supabaseConfig.ts`.
  - `SUPABASE_URL` and the key in `extension/background.js`.
  - Then ship a new extension build.
- [ ] Sign in on the new site, check messages, avatars and attendance, then pause the old project.
