-- ============================================================================================
-- Three changes. Run after 20261023_reward_levels.sql.
--
-- 1. A lead's shift. A lead (or an admin, for any lead) sets the hours they're on shift, Singapore
--    time, and their contributors can only send extension, reclaim and bad-video requests during
--    those hours. A lead with no shift set takes requests any time. Jay Anne's shift is
--    6:00 AM - 2:00 PM.
--
-- 2. The default weekly target is now 125 tasks: 25 a day over 5 working days. Targets a lead has
--    already set for someone stay as they are.
--
-- 3. Everyone can open anyone's profile (leads' and admins' too), except the bot's.
-- ============================================================================================

-- Minutes after midnight, Singapore time. A shift that ends before it starts runs past midnight.
-- RLS on with no policies, so it goes through the functions below.
create table if not exists public.lead_shifts (
  lead_id uuid primary key references public.profiles(id) on delete cascade,
  starts_min int not null check (starts_min between 0 and 1439),
  ends_min int not null check (ends_min between 0 and 1439),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint lead_shifts_not_empty check (starts_min <> ends_min)
);

alter table public.lead_shifts enable row level security;

-- Whether p_minutes (after midnight) falls in a shift, including one that runs past midnight.
create or replace function public.in_shift(p_starts_min int, p_ends_min int, p_minutes int)
returns boolean language sql immutable set search_path = public
as $$
  select case when p_starts_min < p_ends_min
    then p_minutes >= p_starts_min and p_minutes < p_ends_min
    else p_minutes >= p_starts_min or p_minutes < p_ends_min
  end
$$;

-- The shift of the caller's own lead, when they have one and it's set. The dashboard asks this to
-- say when requests are open.
create or replace function public.request_shift()
returns table (lead_id uuid, lead_name text, starts_min int, ends_min int)
language sql stable security definer set search_path = public
as $$
  select l.id, l.name, s.starts_min, s.ends_min
  from public.profiles me
  join public.profiles l on l.id = me.lead_id
  join public.lead_shifts s on s.lead_id = l.id
  where me.id = auth.uid()
$$;

revoke execute on function public.request_shift() from public, anon;
grant execute on function public.request_shift() to authenticated;

-- The shifts a manager can see: every lead's for an admin, their own for a lead.
create or replace function public.lead_shifts()
returns table (lead_id uuid, starts_min int, ends_min int)
language sql stable security definer set search_path = public
as $$
  select s.lead_id, s.starts_min, s.ends_min from public.lead_shifts s
  where public.is_admin() or (public.is_manager() and s.lead_id = auth.uid())
$$;

revoke execute on function public.lead_shifts() from public, anon;
grant execute on function public.lead_shifts() to authenticated;

-- One lead's shift, for their profile. Anyone signed in can see it, like the profile itself.
create or replace function public.lead_shift(p_lead_id uuid)
returns table (starts_min int, ends_min int)
language sql stable security definer set search_path = public
as $$
  select s.starts_min, s.ends_min from public.lead_shifts s
  where s.lead_id = p_lead_id and public.is_active_user()
$$;

revoke execute on function public.lead_shift(uuid) from public, anon;
grant execute on function public.lead_shift(uuid) to authenticated;

-- Sets a lead's shift (the lead themselves, or an admin). Both times null clears it, so requests
-- are open any time again. The Shift on their profile is set to match, so it shows there too.
-- Recorded in the Activity Log.
create or replace function public.set_lead_shift(p_lead_id uuid, p_starts_min int, p_ends_min int)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_name text;
begin
  if not (public.is_admin() or (public.is_manager() and p_lead_id = auth.uid())) then
    raise exception 'You can only change your own shift.';
  end if;
  select name into v_name from public.profiles where id = p_lead_id and role = 'lead';
  if v_name is null then
    raise exception 'That lead was not found.';
  end if;
  if (p_starts_min is null) <> (p_ends_min is null) then
    raise exception 'Pick when the shift starts and ends.';
  end if;
  if p_starts_min is not null and (p_starts_min not between 0 and 1439 or p_ends_min not between 0 and 1439) then
    raise exception 'Pick a time of day.';
  end if;
  if p_starts_min = p_ends_min then
    raise exception 'The shift has to end at a different time than it starts.';
  end if;

  if p_starts_min is null then
    delete from public.lead_shifts where lead_id = p_lead_id;
  else
    insert into public.lead_shifts (lead_id, starts_min, ends_min, updated_by)
    values (p_lead_id, p_starts_min, p_ends_min, auth.uid())
    on conflict (lead_id) do update
      set starts_min = excluded.starts_min, ends_min = excluded.ends_min, updated_by = excluded.updated_by, updated_at = now();
    update public.profiles
    set shift = public.attendance_time_label(p_starts_min) || ' – ' || public.attendance_time_label(p_ends_min), updated_at = now()
    where id = p_lead_id;
  end if;
  perform public.write_audit('setting_changed', p_lead_id,
    case when p_starts_min is null
      then 'Cleared ' || v_name || '''s shift'
      else 'Set ' || v_name || '''s shift to ' || public.attendance_time_label(p_starts_min) || ' - ' || public.attendance_time_label(p_ends_min)
    end,
    jsonb_build_object('setting', 'lead_shift', 'lead_id', p_lead_id, 'starts_min', p_starts_min, 'ends_min', p_ends_min));
end;
$$;

revoke execute on function public.set_lead_shift(uuid, int, int) from public, anon;
grant execute on function public.set_lead_shift(uuid, int, int) to authenticated;

-- A contributor's request only goes in during their lead's shift. Leads and admins (filing a
-- bad-video report themselves) aren't held to it.
create or replace function public.task_requests_within_lead_shift()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  sg_now timestamp := now() at time zone 'Asia/Singapore';
  sg_minutes int := extract(hour from sg_now)::int * 60 + extract(minute from sg_now)::int;
  v_shift record;
begin
  select l.name, s.starts_min, s.ends_min into v_shift
  from public.profiles me
  join public.profiles l on l.id = me.lead_id
  join public.lead_shifts s on s.lead_id = l.id
  where me.id = new.requested_by and me.role = 'contributor';

  if found and not public.in_shift(v_shift.starts_min, v_shift.ends_min, sg_minutes) then
    raise exception 'Requests can only be sent during your lead''s shift, % to %.',
      public.attendance_time_label(v_shift.starts_min), public.attendance_time_label(v_shift.ends_min);
  end if;
  return new;
end;
$$;

drop trigger if exists task_requests_within_lead_shift on public.task_requests;
create trigger task_requests_within_lead_shift before insert on public.task_requests
  for each row execute function public.task_requests_within_lead_shift();

-- Jay Anne's shift: 6:00 AM - 2:00 PM.
insert into public.lead_shifts (lead_id, starts_min, ends_min)
select id, 360, 840 from public.profiles
where role = 'lead' and lower(trim(name)) = 'jay anne r. tan'
on conflict (lead_id) do update set starts_min = excluded.starts_min, ends_min = excluded.ends_min, updated_at = now();

update public.profiles p
set shift = '6:00 AM – 2:00 PM', updated_at = now()
from public.lead_shifts s
where s.lead_id = p.id and s.starts_min = 360 and s.ends_min = 840;

-- ------------------------------------------------------------
-- Default weekly target 50 -> 125. The functions that fall back to it are rewritten in place
-- (only the fallback changes), so they don't have to be copied out here in full. Safe to run again:
-- a function already on 125 is left as it is.
-- ------------------------------------------------------------
alter table public.weekly_targets alter column target set default 125;

do $$
declare
  fn regprocedure;
  def text;
  changed text;
begin
  foreach fn in array array[
    'public.contributor_public_stats(text, date)'::regprocedure,
    'public.contributor_achievements(uuid[])'::regprocedure,
    'public.team_weekly_history(integer)'::regprocedure,
    'public.reward_standings(bigint)'::regprocedure
  ] loop
    def := pg_get_functiondef(fn);
    changed := replace(replace(replace(replace(def,
      'wt.week_start = p_week_start), 50)', 'wt.week_start = p_week_start), 125)'),
      'wt.week_start = w.week_start), 50)', 'wt.week_start = w.week_start), 125)'),
      'coalesce(t.target, 50)', 'coalesce(t.target, 125)'),
      't.week_start = w.ws), 50)', 't.week_start = w.ws), 125)');
    if changed <> def then
      execute changed;
    elsif position('), 125)' in def) = 0 and position('coalesce(t.target, 125)' in def) = 0 then
      raise exception 'No default weekly target found in %', fn;
    end if;
  end loop;
end;
$$;

-- ------------------------------------------------------------
-- Every profile is open to everyone: contributor_public_stats() (what a viewer who can't read the
-- profile row directly gets) now finds leads and admins as well as contributors, though not the
-- bot. A lead or admin has no tasks, so only the name, photo, shift and bio are shown. Safe to run
-- again, including over the earlier copy of this that opened leads' profiles only.
-- ------------------------------------------------------------
do $$
declare
  def text := pg_get_functiondef('public.contributor_public_stats(text, date)'::regprocedure);
  changed text;
begin
  changed := replace(replace(def,
    'p.role = ''contributor'' and public.is_active_user()', 'not p.is_bot and public.is_active_user()'),
    'p.role in (''contributor'', ''lead'') and public.is_active_user()', 'not p.is_bot and public.is_active_user()');
  if changed <> def then
    execute changed;
  elsif position('not p.is_bot and public.is_active_user()' in def) = 0 then
    raise exception 'No role filter found in contributor_public_stats';
  end if;
end;
$$;
