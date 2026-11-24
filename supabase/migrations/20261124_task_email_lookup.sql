-- ============================================================================================
-- Faster "this CB's tasks". The app found a contributor's tasks with cb_email ilike '<email>':
-- case-insensitive, so no index could serve it, and because ilike isn't leakproof, Postgres ran
-- the row-level security check (is_own_or_attached, heavier since team managers) on every row of
-- task_submissions before filtering by email. A CB's profile ran that three times.
--
-- cb_email_lower is the email in lower case, kept by Postgres itself. The app matches it with =,
-- which an index serves, so only that CB's rows are read and checked. Tested on 30,000 tasks:
-- about 5.9 s down to 23 ms for one CB. Run after 20261124_program_messaging.sql.
-- ============================================================================================

alter table public.task_submissions
  add column if not exists cb_email_lower text generated always as (lower(cb_email)) stored;

create index if not exists task_submissions_cb_email_lower_idx
  on public.task_submissions (cb_email_lower, date desc);

analyze public.task_submissions;

notify pgrst, 'reload schema';
