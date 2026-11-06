-- ============================================================================================
-- Public team attendance: a lead (or an admin) can let their team's contributors see the whole
-- team's attendance for the day, with each person's attendance photo. Off for every team until
-- switched on; Ina's team starts with it on. Run after 20261106_team_features.sql.
--
-- Teammates see only name, avatar, hours, tasking status and the photo, through
-- team_attendance_for_date(). The attendance and profiles tables' own RLS doesn't change, so a
-- teammate never reads another's email, Task ID or screenshot link.
-- ============================================================================================

alter table public.team_features add column if not exists attendance_public boolean not null default false;

drop function if exists public.team_features_for(uuid);
create function public.team_features_for(p_user_id uuid)
returns table (cts_enabled boolean, attendance_enabled boolean, attendance_public boolean)
language sql stable security definer set search_path = public
as $$
  select coalesce(f.cts_enabled, true), coalesce(f.attendance_enabled, true), coalesce(f.attendance_public, false)
  from (select 1) one
  left join public.profiles p on p.id = p_user_id and public.is_active_user()
  left join public.team_features f
    on f.lead_id = case when p.role = 'lead' then p.id when p.role = 'contributor' then p.lead_id end
$$;

revoke execute on function public.team_features_for(uuid) from public, anon;
grant execute on function public.team_features_for(uuid) to authenticated;

drop function if exists public.team_features_list();
create function public.team_features_list()
returns table (lead_id uuid, cts_enabled boolean, attendance_enabled boolean, attendance_public boolean)
language sql stable security definer set search_path = public
as $$
  select f.lead_id, f.cts_enabled, f.attendance_enabled, f.attendance_public from public.team_features f
  where public.is_admin() or (public.is_manager() and f.lead_id = auth.uid())
$$;

revoke execute on function public.team_features_list() from public, anon;
grant execute on function public.team_features_list() to authenticated;

drop function if exists public.set_team_features(uuid, boolean, boolean);
create or replace function public.set_team_features(
  p_lead_id uuid,
  p_cts_enabled boolean,
  p_attendance_enabled boolean,
  p_attendance_public boolean
)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_name text;
  v_old record;
  v_changes text[] := '{}';
begin
  if not (public.is_admin() or (public.is_manager() and p_lead_id = auth.uid())) then
    raise exception 'You can only change your own team''s features.';
  end if;
  if p_cts_enabled is null or p_attendance_enabled is null or p_attendance_public is null then
    raise exception 'Choose on or off.';
  end if;
  select name into v_name from public.profiles where id = p_lead_id and role = 'lead';
  if v_name is null then
    raise exception 'That lead was not found.';
  end if;

  select coalesce(f.cts_enabled, true) as cts, coalesce(f.attendance_enabled, true) as att,
         coalesce(f.attendance_public, false) as pub into v_old
  from (select 1) one left join public.team_features f on f.lead_id = p_lead_id;

  if v_old.cts is distinct from p_cts_enabled then
    v_changes := v_changes || (case when p_cts_enabled then 'turned on' else 'turned off' end || ' the CTS Form');
  end if;
  if v_old.att is distinct from p_attendance_enabled then
    v_changes := v_changes || (case when p_attendance_enabled then 'turned on' else 'turned off' end || ' Attendance');
  end if;
  if v_old.pub is distinct from p_attendance_public then
    v_changes := v_changes || (case when p_attendance_public then 'made attendance public' else 'made attendance private' end);
  end if;
  if array_length(v_changes, 1) is null then
    return;
  end if;

  insert into public.team_features (lead_id, cts_enabled, attendance_enabled, attendance_public, updated_by)
  values (p_lead_id, p_cts_enabled, p_attendance_enabled, p_attendance_public, auth.uid())
  on conflict (lead_id) do update
    set cts_enabled = excluded.cts_enabled,
        attendance_enabled = excluded.attendance_enabled,
        attendance_public = excluded.attendance_public,
        updated_by = excluded.updated_by,
        updated_at = now();

  perform public.write_audit('setting_changed', p_lead_id,
    initcap(left(array_to_string(v_changes, ' and '), 1)) || substr(array_to_string(v_changes, ' and '), 2) || ' for ' || v_name || '''s team',
    jsonb_build_object('setting', 'team_features', 'lead_id', p_lead_id, 'cts_enabled', p_cts_enabled,
      'attendance_enabled', p_attendance_enabled, 'attendance_public', p_attendance_public));
end;
$$;

revoke execute on function public.set_team_features(uuid, boolean, boolean, boolean) from public, anon;
grant execute on function public.set_team_features(uuid, boolean, boolean, boolean) to authenticated;

-- The lead whose team's attendance the caller may see as a teammate: their own lead, when that
-- team has attendance on and public. Null otherwise.
create or replace function public.public_attendance_lead()
returns uuid language sql stable security definer set search_path = public
as $$
  select p.lead_id from public.profiles p
  join public.team_features f on f.lead_id = p.lead_id
  where p.id = auth.uid() and p.role = 'contributor' and p.is_active and public.is_active_user()
    and f.attendance_enabled and f.attendance_public
$$;

revoke execute on function public.public_attendance_lead() from public, anon;
grant execute on function public.public_attendance_lead() to authenticated;

-- A contributor's view of their public team on a day: every active teammate (themselves included),
-- filed or not. Nothing when their team isn't public.
create or replace function public.team_attendance_for_date(p_date date)
returns table (
  user_id uuid,
  name text,
  avatar_url text,
  hours text,
  tasking_status text,
  photo_ref text,
  filed_at timestamptz
)
language sql stable security definer set search_path = public
as $$
  select p.id, p.name, p.avatar_url, a.hours, a.tasking_status, a.photo_ref, a.updated_at
  from public.profiles p
  left join public.attendance a on a.user_id = p.id and a.date = p_date
  where p.lead_id = public.public_attendance_lead()
    and p.role = 'contributor' and p.is_active
  order by p.name
$$;

revoke execute on function public.team_attendance_for_date(date) from public, anon;
grant execute on function public.team_attendance_for_date(date) to authenticated;

-- Whether the caller may see the attendance photo with this Drive id: anyone who can read its entry
-- (themselves, their lead, an admin), or a teammate on a public team. Used by api/attendance-photo.
create or replace function public.can_view_attendance_photo(p_ref text)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.attendance a
    join public.profiles p on p.id = a.user_id
    where a.photo_ref = p_ref
      and (
        public.is_admin()
        or public.is_own_or_attached(a.user_id)
        or (p.role = 'contributor' and p.lead_id = public.public_attendance_lead())
      )
  )
$$;

revoke execute on function public.can_view_attendance_photo(text) from public, anon;
grant execute on function public.can_view_attendance_photo(text) to authenticated;

-- Ina's team: attendance public.
insert into public.team_features (lead_id, attendance_public)
select id, true from public.profiles
where role = 'lead' and lower(trim(name)) ~ '^ina\M'
on conflict (lead_id) do update set attendance_public = true, updated_at = now();
