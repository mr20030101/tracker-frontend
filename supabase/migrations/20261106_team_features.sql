-- ============================================================================================
-- Team features: a lead (or an admin, for any lead) can switch off the CTS Form and daily
-- Attendance for their own team. Both are on for every team until switched off. Jay Anne's team
-- starts with both off. Run after 20261029_task_audits.sql.
--
-- With CTS off, the team's contributors no longer see the CTS Form button or the CTS column.
-- With Attendance off, they no longer see the Attendance page, form or countdown, can't file it
-- themselves, and the team is left out of the leads' and admins' Attendance page.
-- ============================================================================================

-- One row per lead who has changed something. No row means everything is on. RLS on with no
-- policies, so it goes through the functions below.
create table if not exists public.team_features (
  lead_id uuid primary key references public.profiles(id) on delete cascade,
  cts_enabled boolean not null default true,
  attendance_enabled boolean not null default true,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.team_features enable row level security;

-- The features of one person's team: a contributor's lead's, or a lead's own. Anyone signed in can
-- ask (it's two on/off flags), so a profile page can show or hide the CTS column for whoever it's
-- for. Everything is on for an admin, someone with no lead, or a team that hasn't changed anything.
create or replace function public.team_features_for(p_user_id uuid)
returns table (cts_enabled boolean, attendance_enabled boolean)
language sql stable security definer set search_path = public
as $$
  select coalesce(f.cts_enabled, true), coalesce(f.attendance_enabled, true)
  from (select 1) one
  left join public.profiles p on p.id = p_user_id and public.is_active_user()
  left join public.team_features f
    on f.lead_id = case when p.role = 'lead' then p.id when p.role = 'contributor' then p.lead_id end
$$;

revoke execute on function public.team_features_for(uuid) from public, anon;
grant execute on function public.team_features_for(uuid) to authenticated;

-- The teams' features a manager can see: every team that changed something for an admin, their
-- own for a lead.
create or replace function public.team_features_list()
returns table (lead_id uuid, cts_enabled boolean, attendance_enabled boolean)
language sql stable security definer set search_path = public
as $$
  select f.lead_id, f.cts_enabled, f.attendance_enabled from public.team_features f
  where public.is_admin() or (public.is_manager() and f.lead_id = auth.uid())
$$;

revoke execute on function public.team_features_list() from public, anon;
grant execute on function public.team_features_list() to authenticated;

-- Turns a team's CTS Form and Attendance on or off (the lead themselves, or an admin). Recorded in
-- the Activity Log.
create or replace function public.set_team_features(p_lead_id uuid, p_cts_enabled boolean, p_attendance_enabled boolean)
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
  if p_cts_enabled is null or p_attendance_enabled is null then
    raise exception 'Choose on or off.';
  end if;
  select name into v_name from public.profiles where id = p_lead_id and role = 'lead';
  if v_name is null then
    raise exception 'That lead was not found.';
  end if;

  select coalesce(f.cts_enabled, true) as cts, coalesce(f.attendance_enabled, true) as att into v_old
  from (select 1) one left join public.team_features f on f.lead_id = p_lead_id;

  if v_old.cts is distinct from p_cts_enabled then
    v_changes := v_changes || (case when p_cts_enabled then 'turned on' else 'turned off' end || ' the CTS Form');
  end if;
  if v_old.att is distinct from p_attendance_enabled then
    v_changes := v_changes || (case when p_attendance_enabled then 'turned on' else 'turned off' end || ' Attendance');
  end if;
  if array_length(v_changes, 1) is null then
    return;
  end if;

  insert into public.team_features (lead_id, cts_enabled, attendance_enabled, updated_by)
  values (p_lead_id, p_cts_enabled, p_attendance_enabled, auth.uid())
  on conflict (lead_id) do update
    set cts_enabled = excluded.cts_enabled,
        attendance_enabled = excluded.attendance_enabled,
        updated_by = excluded.updated_by,
        updated_at = now();

  perform public.write_audit('setting_changed', p_lead_id,
    initcap(left(array_to_string(v_changes, ' and '), 1)) || substr(array_to_string(v_changes, ' and '), 2) || ' for ' || v_name || '''s team',
    jsonb_build_object('setting', 'team_features', 'lead_id', p_lead_id, 'cts_enabled', p_cts_enabled, 'attendance_enabled', p_attendance_enabled));
end;
$$;

revoke execute on function public.set_team_features(uuid, boolean, boolean) from public, anon;
grant execute on function public.set_team_features(uuid, boolean, boolean) to authenticated;

-- A contributor can't file their own attendance while their team has it off. A lead or admin
-- filing for someone (support) still can, so nothing is lost if it's turned back on later.
create or replace function public.attendance_team_enabled()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.filed_by = new.user_id
    and not (select attendance_enabled from public.team_features_for(new.user_id)) then
    raise exception 'Your team doesn''t take attendance in the Tracker.';
  end if;
  return new;
end;
$$;

drop trigger if exists attendance_team_enabled on public.attendance;
create trigger attendance_team_enabled before insert or update on public.attendance
  for each row execute function public.attendance_team_enabled();

-- Jay Anne's team: no CTS Form and no Attendance.
insert into public.team_features (lead_id, cts_enabled, attendance_enabled)
select id, false, false from public.profiles
where role = 'lead' and lower(trim(name)) = 'jay anne r. tan'
on conflict (lead_id) do update set cts_enabled = false, attendance_enabled = false, updated_at = now();
