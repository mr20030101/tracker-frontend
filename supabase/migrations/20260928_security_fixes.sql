-- Security fixes, 2026-09-28. Run once in the Supabase SQL editor.
--
-- Changes rules and functions only: nothing here deletes a table, column or row (no DELETE,
-- TRUNCATE, DROP TABLE or DROP FUNCTION). Each "drop policy if exists" just removes a rule so its
-- new version can be created on the next line. It all runs in one transaction: if any statement
-- fails, none of it is applied and the database is left exactly as it was.
--
-- The same changes are in schema.sql; this file exists because schema.sql as a whole can't be
-- re-run on the live database (several of its policies have no drop-if-exists and would fail).

begin;

-- 1. Permission helpers: inactive accounts and ones still on a temporary password fail every check.
create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.profiles where id = auth.uid() and is_active and not must_change_password) $$;

create or replace function public.is_manager()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.profiles where id = auth.uid() and is_active and not must_change_password and role in ('lead', 'admin')) $$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.profiles where id = auth.uid() and is_active and not must_change_password and role = 'admin') $$;

create or replace function public.is_own_or_attached(profile_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_active_user() and (
    profile_id = auth.uid()
    or exists (select 1 from public.profiles where id = profile_id and lead_id = auth.uid())
  )
$$;

create or replace function public.own_email()
returns text language sql stable security definer set search_path = public
as $$ select email from public.profiles where id = auth.uid() $$;

create or replace function public.is_project_lead(target_project_id bigint)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.project_leads where project_id = target_project_id and lead_id = auth.uid()) $$;

create or replace function public.can_view_project(target_project_id bigint)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_active_user() and (
    public.is_admin()
    or public.is_project_lead(target_project_id)
    or exists (
      select 1 from public.profiles p join public.project_leads pl on pl.lead_id = p.lead_id
      where p.id = auth.uid() and pl.project_id = target_project_id
    )
  )
$$;

-- 2. Signed-in-only functions also require an active caller.
create or replace function public.directory()
returns table (id uuid, name text, is_active boolean, last_seen_at timestamptz, avatar_url text, role text, is_bot boolean, email text)
language sql stable security definer set search_path = public
as $$
  select p.id, p.name, p.is_active,
    case when public.is_manager() or p.last_seen_at > now() - interval '3 minutes' then p.last_seen_at end,
    p.avatar_url, p.role, p.is_bot,
    case when public.is_manager() then p.email end
  from public.profiles p
  where p.is_active and public.is_active_user() and (
    public.is_manager()
    or p.is_bot
    or p.role = 'admin'
    or p.last_seen_at > now() - interval '3 minutes'
    or p.id = (select me.lead_id from public.profiles me where me.id = auth.uid())
    or exists (
      select 1 from public.messages m
      where (m.sender_id = auth.uid() and m.recipient_id = p.id)
         or (m.recipient_id = auth.uid() and m.sender_id = p.id)
    )
  )
$$;

create or replace function public.office_roster()
returns table (id uuid, name text, role text, avatar_url text, lead_id uuid, office_avatar jsonb)
language sql stable security definer set search_path = public
as $$
  select p.id, p.name, p.role, p.avatar_url, p.lead_id, p.office_avatar
  from public.profiles p, public.profiles me
  where me.id = auth.uid() and public.is_active_user()
    and p.is_active and not p.is_bot
    and (
      public.is_admin()
      or p.id = me.id
      or p.id = me.lead_id
      or p.lead_id = me.id
      or (me.role = 'contributor' and p.role = 'contributor' and p.lead_id is not distinct from me.lead_id)
    )
$$;

create or replace function public.can_view_office_floor(target_floor text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles me
    where me.id = auth.uid() and me.is_active and not me.must_change_password and (
      me.role = 'admin'
      or (me.role = 'lead' and target_floor = me.id::text)
      or (me.role = 'contributor' and target_floor = coalesce(me.lead_id::text, 'none'))
    )
  )
$$;

create or replace function public.leaderboard(range_start date, range_end date)
returns table (user_id uuid, name text, avatar_url text, cb_email text, tasks_submitted bigint)
language sql stable security definer set search_path = public
as $$
  select
    p.id as user_id,
    p.name,
    p.avatar_url,
    p.email as cb_email,
    (
      select count(*) from public.task_submissions s
      where s.status = 'submitted'
        and s.date >= range_start
        and s.date <= range_end
        and (s.user_id = p.id or lower(s.cb_email) = lower(p.email))
    ) as tasks_submitted
  from public.profiles p
  where p.role = 'contributor' and p.is_active and public.is_active_user()
    and p.lead_id is not distinct from (select lead_id from public.profiles where id = auth.uid())
  order by tasks_submitted desc, p.name asc
$$;

create or replace function public.contributor_public_stats(p_target_email text, p_week_start date)
returns table (
  id uuid,
  name text,
  avatar_url text,
  role text,
  lead_id uuid,
  is_active boolean,
  shift text,
  bio text,
  weekly_target integer,
  submitted_this_week bigint,
  stage_breakdown jsonb,
  project_breakdown jsonb,
  trend jsonb,
  levels jsonb
)
language sql stable security definer set search_path = public
as $$
  with target as (
    select * from public.profiles p
    where lower(p.email) = lower(p_target_email) and p.role = 'contributor' and public.is_active_user()
  ),
  target_submissions as (
    select s.* from public.task_submissions s, target t
    where lower(s.cb_email) = lower(t.email) or s.user_id = t.id
  ),
  stage_agg as (
    select coalesce(jsonb_object_agg(stage, cnt), '{}'::jsonb) as j
    from (select stage, count(*) as cnt from target_submissions group by stage) x
  ),
  project_agg as (
    select coalesce(jsonb_agg(jsonb_build_object('name', pname, 'total', cnt) order by cnt desc), '[]'::jsonb) as j
    from (
      select coalesce(p.name, 'Unassigned') as pname, count(*) as cnt
      from target_submissions ts
      left join public.projects p on p.id = ts.project_id
      group by coalesce(p.name, 'Unassigned')
    ) x
  ),
  trend_days as (
    select gs::date as d from generate_series(current_date - interval '29 days', current_date, interval '1 day') gs
  ),
  trend_agg as (
    select coalesce(
      jsonb_agg(jsonb_build_object('date', to_char(td.d, 'YYYY-MM-DD'), 'value', coalesce(c.cnt, 0)) order by td.d),
      '[]'::jsonb
    ) as j
    from trend_days td
    left join (
      select date as d, count(*) as cnt from target_submissions where status = 'submitted' group by date
    ) c on c.d = td.d
  ),
  levels_agg as (
    select coalesce(
      jsonb_agg(jsonb_build_object('project_id', cpl.project_id, 'level', cpl.level)),
      '[]'::jsonb
    ) as j
    from public.contributor_project_levels cpl, target t
    where cpl.user_id = t.id
  )
  select
    t.id,
    t.name,
    t.avatar_url,
    t.role,
    t.lead_id,
    t.is_active,
    t.shift,
    t.bio,
    coalesce((select wt.target from public.weekly_targets wt where wt.user_id = t.id and wt.week_start = p_week_start), 50) as weekly_target,
    (
      select count(*) from target_submissions ts
      where ts.status = 'submitted' and ts.date >= p_week_start and ts.date <= (p_week_start + 6)
    ) as submitted_this_week,
    (select j from stage_agg) as stage_breakdown,
    (select j from project_agg) as project_breakdown,
    (select j from trend_agg) as trend,
    (select j from levels_agg) as levels
  from target t
$$;

-- 3. New logins are inactive contributors; only API users are held to the role guard.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name, email, role, is_active)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)), new.email, 'contributor', false)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

create or replace function public.prevent_non_admin_role_change()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.role is distinct from old.role and auth.role() in ('anon', 'authenticated') and not public.is_admin() then
    raise exception 'Only admins can change a user''s role.';
  end if;
  return new;
end;
$$;

-- 4. Profiles: own row always readable; no self-insert.
drop policy if exists "profiles read own or manager" on public.profiles;
-- Your own row is always readable, even while inactive or on a temporary password (the app reads it
-- to show "Account disabled" or the change-password screen); everything else needs an active caller.
create policy "profiles read own or manager" on public.profiles for select
  using (id = auth.uid() or public.is_admin() or public.is_own_or_attached(id));
-- No client-side profile creation: handle_new_user() makes one for every login, and manage-user
-- (service role) fills it in. A self-insert policy only gave a signed-up stranger a second way in.
drop policy if exists "users create own profile" on public.profiles;

-- 5. Failed-login log cap.
create or replace function public.limit_failed_login_logs()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.event <> 'login_failed' then
    return new;
  end if;
  if (select count(*) from public.activity_logs where event = 'login_failed' and created_at > now() - interval '1 minute') >= 30 then
    return null;
  end if;
  new.email := left(new.email, 254);
  new.user_agent := left(new.user_agent, 500);
  return new;
end;
$$;

create index if not exists activity_logs_failed_login_idx on public.activity_logs(created_at) where event = 'login_failed';

drop trigger if exists activity_logs_limit_failed_logins on public.activity_logs;
create trigger activity_logs_limit_failed_logins
  before insert on public.activity_logs
  for each row execute function public.limit_failed_login_logs();

-- 6. Submissions tied to the contributor's own email.
drop policy if exists "users create own submissions" on public.task_submissions;
-- The leaderboard, public stats, dashboard and daily digest all credit a submission to whoever its
-- cb_email names (not only its user_id), so a contributor may only log rows under their own email —
-- otherwise they could pad, or clutter, someone else's numbers. A lead/admin logs work for their
-- team under the contributor's email, so they aren't held to this.
create policy "users create own submissions" on public.task_submissions for insert
  with check (
    (public.is_admin() or public.is_own_or_attached(user_id))
    and (public.is_manager() or lower(cb_email) = lower(public.own_email()))
  );
drop policy if exists "users update permitted submissions" on public.task_submissions;
create policy "users update permitted submissions" on public.task_submissions for update
  using (public.is_admin() or public.is_own_or_attached(user_id))
  with check (
    (public.is_admin() or public.is_own_or_attached(user_id))
    and (public.is_manager() or lower(cb_email) = lower(public.own_email()))
  );
-- 7. Requests must start pending and unreviewed.
drop policy if exists "users create own extension requests" on public.task_requests;
drop policy if exists "users create extension or bad video requests" on public.task_requests;
-- Every request starts pending and unreviewed: without this, a contributor could insert one
-- already marked approved (with any reviewer named), and it would never be filed with Scale.
create policy "users create extension or bad video requests" on public.task_requests for insert
  with check (
    requested_by = auth.uid()
    and status = 'pending' and reviewed_by is null and reviewed_at is null
    and (
      (type in ('extension', 'reclaim') and exists (
        select 1 from public.task_submissions s
        where s.id = task_submission_id and public.is_own_or_attached(s.user_id)
      ))
      or (type = 'bad_video' and (
        public.is_manager()
        or exists (
          select 1 from public.task_submissions s
          where s.id = task_submission_id and public.is_own_or_attached(s.user_id)
        )
      ))
    )
  );
-- 8. Weekly targets: leads and admins only.
drop policy if exists "managers manage targets" on public.weekly_targets;
-- Only a lead (for their attached contributors) or an admin sets targets. is_own_or_attached() alone
-- also matches the caller's own row, which let a contributor lower their own target.
create policy "managers manage targets" on public.weekly_targets for all
  using (public.is_admin() or (public.is_manager() and public.is_own_or_attached(user_id) and user_id <> auth.uid()))
  with check (public.is_admin() or (public.is_manager() and public.is_own_or_attached(user_id) and user_id <> auth.uid()));

-- 9. Resources bucket private, access by project folder.
update storage.buckets set public = false where id = 'resources';

create or replace function public.can_read_resource_file(object_name text)
returns boolean language sql stable security definer set search_path = public
as $$
  select case
    when (storage.foldername(object_name))[1] is null then public.is_active_user()
    when (storage.foldername(object_name))[1] = 'general' then public.is_active_user()
    when (storage.foldername(object_name))[1] ~ '^\d+$' then public.can_view_project(((storage.foldername(object_name))[1])::bigint)
    else public.is_admin()
  end
$$;

create or replace function public.can_write_resource_file(object_name text)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_admin() or (
    (storage.foldername(object_name))[1] ~ '^\d+$'
    and public.is_project_lead(((storage.foldername(object_name))[1])::bigint)
    and public.is_manager()
  )
$$;

drop policy if exists "active users read resource files" on storage.objects;
drop policy if exists "managers upload resource files" on storage.objects;
drop policy if exists "managers update resource files" on storage.objects;
drop policy if exists "managers delete resource files" on storage.objects;
drop policy if exists "users read permitted resource files" on storage.objects;
drop policy if exists "project leads upload resource files" on storage.objects;
drop policy if exists "project leads update resource files" on storage.objects;
drop policy if exists "project leads delete resource files" on storage.objects;
create policy "users read permitted resource files" on storage.objects for select
  using (bucket_id = 'resources' and public.can_read_resource_file(name));
create policy "project leads upload resource files" on storage.objects for insert
  with check (bucket_id = 'resources' and public.can_write_resource_file(name));
create policy "project leads update resource files" on storage.objects for update
  using (bucket_id = 'resources' and public.can_write_resource_file(name))
  with check (bucket_id = 'resources' and public.can_write_resource_file(name));
create policy "project leads delete resource files" on storage.objects for delete
  using (bucket_id = 'resources' and public.can_write_resource_file(name));

commit;
