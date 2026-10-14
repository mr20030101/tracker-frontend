-- Second batch of fixes from the 2026-10-14 security review.

-- ============================================================================================
-- 1. Leads could log tasks under anyone's email, including other teams', and those rows count
-- toward that person's leaderboard, streaks and paid rewards. A lead may now only log under their
-- own email or one of their own team's; admins are still unrestricted.
-- ============================================================================================
create or replace function public.can_log_for_email(p_email text)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_admin()
    or lower(p_email) = lower(public.own_email())
    or (
      public.is_manager()
      and exists (select 1 from public.profiles p where lower(p.email) = lower(p_email) and p.lead_id = auth.uid())
    )
$$;

drop policy if exists "users create own submissions" on public.task_submissions;
create policy "users create own submissions" on public.task_submissions for insert
  with check (
    (public.is_admin() or public.is_own_or_attached(user_id))
    and public.can_log_for_email(cb_email)
  );
drop policy if exists "users update permitted submissions" on public.task_submissions;
create policy "users update permitted submissions" on public.task_submissions for update
  using (public.is_admin() or public.is_own_or_attached(user_id))
  with check (
    (public.is_admin() or public.is_own_or_attached(user_id))
    and public.can_log_for_email(cb_email)
  );

-- ============================================================================================
-- 2. clear_must_change_password() lifted the forced password change without checking the
-- password had changed, so someone on a temporary password could skip it. manage-user now
-- records the temporary password's hash (record_temporary_password) each time it sets one, and
-- clearing the flag is refused while the login still has that hash. The hashes sit in a table
-- with RLS on and no policies, so no client can read them.
-- ============================================================================================
create table if not exists public.temporary_passwords (
  user_id uuid primary key references auth.users(id) on delete cascade,
  encrypted_password text not null,
  set_at timestamptz not null default now()
);
alter table public.temporary_passwords enable row level security;
revoke all on public.temporary_passwords from anon, authenticated;

create or replace function public.record_temporary_password(p_user_id uuid)
returns void language sql security definer set search_path = public
as $$
  insert into public.temporary_passwords (user_id, encrypted_password)
  select id, encrypted_password from auth.users where id = p_user_id
  on conflict (user_id) do update set encrypted_password = excluded.encrypted_password, set_at = now()
$$;
revoke execute on function public.record_temporary_password(uuid) from public, anon, authenticated;
grant execute on function public.record_temporary_password(uuid) to service_role;

-- Everyone already waiting to change a temporary password is still on it.
insert into public.temporary_passwords (user_id, encrypted_password)
select u.id, u.encrypted_password
from auth.users u join public.profiles p on p.id = u.id
where p.must_change_password and u.encrypted_password is not null
on conflict (user_id) do nothing;

create or replace function public.clear_must_change_password()
returns public.profiles
language plpgsql security definer set search_path = public
as $$
declare
  updated public.profiles;
begin
  if exists (
    select 1 from public.temporary_passwords t join auth.users u on u.id = t.user_id
    where t.user_id = auth.uid() and u.encrypted_password = t.encrypted_password
  ) then
    raise exception 'Choose a new password first.';
  end if;

  delete from public.temporary_passwords where user_id = auth.uid();

  update public.profiles
  set must_change_password = false,
      updated_at = now()
  where id = auth.uid()
  returning * into updated;

  return updated;
end;
$$;

grant execute on function public.clear_must_change_password() to authenticated;

-- ============================================================================================
-- 3. Avatars: the public bucket took any file type and size from any signed-in user (free file
-- hosting), and update_own_profile accepted any avatar URL (e.g. a tracking pixel logging every
-- viewer's IP). Images only, 5 MB, active users only, and a new avatar URL must point at the
-- caller's own folder in this bucket.
-- ============================================================================================
update storage.buckets
set file_size_limit = 5 * 1024 * 1024,
    allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
where id = 'avatars';

drop policy if exists "users upload own avatar" on storage.objects;
create policy "users upload own avatar" on storage.objects for insert
  with check (bucket_id = 'avatars' and public.is_active_user() and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "users update own avatar" on storage.objects;
create policy "users update own avatar" on storage.objects for update
  using (bucket_id = 'avatars' and public.is_active_user() and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and public.is_active_user() and (storage.foldername(name))[1] = auth.uid()::text);

-- ============================================================================================
-- 4. Contributor emails (their login names) leaked to other contributors through the leaderboard,
-- team history and reward standings. Only managers get them now; the app links by user id.
-- ============================================================================================
drop function if exists public.leaderboard(date, date);
create function public.leaderboard(range_start date, range_end date)
returns table (user_id uuid, name text, avatar_url text, cb_email text, tasks_submitted bigint)
language sql stable security definer set search_path = public
as $$
  select
    p.id as user_id,
    p.name,
    p.avatar_url,
    case when public.is_manager() then p.email end as cb_email,
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

grant execute on function public.leaderboard(date, date) to authenticated;

create or replace function public.team_weekly_history(p_weeks integer)
returns table (user_id uuid, name text, avatar_url text, cb_email text, week_start date, submitted integer, target integer)
language sql stable security definer set search_path = public
as $$
  with cw as (
    select d - ((extract(isodow from d)::int + 5) % 7) as ws
    from (select (now() at time zone 'Asia/Singapore')::date as d) t
  ),
  weeks as (
    select (select ws from cw) - 7 * g as week_start
    from generate_series(0, least(greatest(p_weeks, 1), 26) - 1) g
  ),
  team as (
    select p.id, p.name, p.avatar_url, p.email from public.profiles p
    where p.role = 'contributor' and p.is_active and public.is_active_user()
      and p.lead_id is not distinct from (select lead_id from public.profiles where id = auth.uid())
  )
  select t.id, t.name, t.avatar_url, case when public.is_manager() then t.email end, w.week_start,
    (
      select count(*) from public.task_submissions s
      where s.status = 'submitted' and s.date >= w.week_start and s.date < w.week_start + 7
        and (s.user_id = t.id or lower(s.cb_email) = lower(t.email))
    )::integer,
    coalesce((select wt.target from public.weekly_targets wt where wt.user_id = t.id and wt.week_start = w.week_start), 50)
  from team t cross join weeks w
  order by w.week_start desc, t.name
$$;

revoke execute on function public.team_weekly_history(integer) from public, anon;
grant execute on function public.team_weekly_history(integer) to authenticated, service_role;

create or replace function public.reward_standings(p_reward_id bigint)
returns table (
  user_id uuid, name text, avatar_url text, cb_email text,
  submitted integer, weeks_hit integer, weeks_total integer, reached_at timestamptz, place integer, qualifies boolean
)
language plpgsql stable security definer set search_path = public
as $$
declare
  r public.rewards;
  first_week date;
begin
  select * into r from public.rewards where id = p_reward_id;
  if r.id is null or not public.can_view_reward(r.team_lead_id) then
    return;
  end if;
  -- The first Tuesday on or after the start: weeks counted for every_week_on_target.
  first_week := r.starts_on + ((2 - extract(isodow from r.starts_on)::int + 7) % 7);

  return query
  with people as (
    select p.id, p.name, p.avatar_url, p.email from public.profiles p
    where p.role = 'contributor' and p.is_active and (r.team_lead_id is null or p.lead_id = r.team_lead_id)
  ),
  subs as (
    select pe.id as uid, s.date, s.created_at
    from people pe
    join public.task_submissions s
      on s.status = 'submitted' and s.date between r.starts_on and r.ends_on
     and (r.project_id is null or s.project_id = r.project_id)
     and (s.user_id = pe.id or lower(s.cb_email) = lower(pe.email))
  ),
  totals as (
    select x.uid, count(*)::integer as n, max(x.created_at) as reached from subs x group by x.uid
  ),
  weeks as (
    select gs::date as ws from generate_series(first_week::timestamp, (r.ends_on - 6)::timestamp, interval '7 days') gs
  ),
  weekly as (
    select pe.id as uid, w.ws,
      (select count(*) from subs x where x.uid = pe.id and x.date >= w.ws and x.date < w.ws + 7) as n,
      coalesce((select t.target from public.weekly_targets t where t.user_id = pe.id and t.week_start = w.ws), 50) as target
    from people pe cross join weeks w
  ),
  hits as (
    select wk.uid, count(*) filter (where wk.n > 0 and wk.n >= wk.target)::integer as hit from weekly wk group by wk.uid
  ),
  ranked as (
    select pe.id, pe.name, pe.avatar_url, pe.email,
      coalesce(t.n, 0) as n, t.reached,
      coalesce(h.hit, 0) as hit,
      (select count(*) from weeks)::integer as total,
      row_number() over (order by coalesce(t.n, 0) desc, t.reached asc nulls last, pe.name)::integer as rn
    from people pe
    left join totals t on t.uid = pe.id
    left join hits h on h.uid = pe.id
  )
  select k.id, k.name, k.avatar_url, case when public.is_manager() then k.email end, k.n, k.hit, k.total, k.reached,
    case when r.rule = 'top_submitters' then k.rn end,
    case r.rule
      when 'top_submitters' then k.n >= greatest(coalesce(r.threshold, 1), 1) and k.rn <= r.places
      when 'min_tasks' then k.n >= r.threshold
      when 'every_week_on_target' then k.total > 0 and k.hit = k.total
      else false
    end
  from ranked k
  order by k.rn;
end;
$$;

-- ============================================================================================
-- 5. (see 3) update_own_profile only accepts a new avatar URL from the caller's own avatars folder.
-- ============================================================================================
create or replace function public.update_own_profile(
  new_name text,
  new_avatar_url text,
  new_remotasks_id text default null,
  new_shift text default null,
  new_bio text default null
)
returns public.profiles
language plpgsql security definer set search_path = public
as $$
declare
  v_remotasks_id text := lower(trim(coalesce(new_remotasks_id, '')));
  updated public.profiles;
begin
  if new_name is null or trim(new_name) = '' then
    raise exception 'Name is required.';
  end if;

  -- A Remotasks ID is a 24-character hex id (e.g. 60e818c8f76af4001e9901d6).
  if v_remotasks_id <> '' and v_remotasks_id !~ '^[0-9a-f]{24}$' then
    raise exception 'A Remotask ID is 24 characters: the digits 0-9 and the letters a-f.';
  end if;

  -- A new avatar must be an upload in the caller's own folder of the avatars bucket; any other URL
  -- (e.g. a tracking pixel) would load in every viewer's browser. An unchanged one is kept as is.
  if new_avatar_url is not null
    and new_avatar_url is distinct from (select avatar_url from public.profiles where id = auth.uid())
    and new_avatar_url !~ ('^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/avatars/' || auth.uid()::text || '/[^/?#]+(\?v=[0-9]+)?$') then
    raise exception 'Upload your photo from Edit Profile.';
  end if;

  update public.profiles
  set name = trim(new_name),
      avatar_url = new_avatar_url,
      remotasks_id = nullif(v_remotasks_id, ''),
      shift = nullif(trim(coalesce(new_shift, '')), ''),
      bio = nullif(trim(coalesce(new_bio, '')), ''),
      updated_at = now()
  where id = auth.uid()
  returning * into updated;

  return updated;
end;
$$;

grant execute on function public.update_own_profile(text, text, text, text, text) to authenticated;
