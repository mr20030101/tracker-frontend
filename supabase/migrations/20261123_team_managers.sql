-- ============================================================================================
-- Team managers: a role between admin and lead. Administrator → Team manager → Leads →
-- Contributors. Each team manager runs one program, Bootcamp or RST, set by an admin, and is an
-- admin for that program: every lead whose team is in it, and those leads' contributors.
--
-- They can do what a lead does, for any team in their program, and manage those people: edit them,
-- assign contributors to the program's leads, and switch someone between contributor and lead.
-- Only admins make someone a team manager or admin, set a team manager's program, or move a team
-- between programs. Admin-only pages (App Settings, Activity Log, Billing, Hiring) stay admin-only.
--
-- Most access already goes through is_manager(), is_own_or_attached() and is_project_lead(), so
-- widening those reaches most of the app. The functions that checked "the lead is me" directly are
-- redefined further down with manages_team(), and are otherwise unchanged.
-- Run after 20261123_free_audits.sql.
-- ============================================================================================

begin;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('contributor', 'lead', 'team_manager', 'admin'));

-- A team manager's program. Empty for everyone else; a team manager without one sees no teams.
alter table public.profiles add column if not exists program text check (program in ('bootcamp', 'rst'));

-- -------------------------------------------------------------------------------------------
-- Helpers
-- -------------------------------------------------------------------------------------------

create or replace function public.is_team_manager()
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_active and not must_change_password and role = 'team_manager' and program is not null
  )
$$;

-- The program of a lead's team, or of a contributor's lead's team. Null for anyone else
-- (admins, team managers, contributors with no lead).
create or replace function public.team_program_of(p_user_id uuid)
returns text language sql stable security definer set search_path = public
as $$
  select coalesce(f.program, 'bootcamp')
  from public.profiles p
  left join public.team_features f
    on f.lead_id = case when p.role = 'lead' then p.id when p.role = 'contributor' then p.lead_id end
  where p.id = p_user_id
    and (p.role = 'lead' or (p.role = 'contributor' and p.lead_id is not null))
$$;

-- Whether a lead or contributor is in the calling team manager's program.
create or replace function public.in_my_program(p_user_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_team_manager()
    and public.team_program_of(p_user_id) = (select program from public.profiles where id = auth.uid())
$$;

-- Whether the caller runs this lead's team: the lead themselves, or a team manager of its program.
create or replace function public.manages_team(p_lead_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select p_lead_id = auth.uid()
    or (
      public.in_my_program(p_lead_id)
      and exists (select 1 from public.profiles where id = p_lead_id and role = 'lead')
    )
$$;

do $$
declare
  fn text;
begin
  foreach fn in array array['is_team_manager()', 'team_program_of(uuid)', 'in_my_program(uuid)', 'manages_team(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated', fn);
  end loop;
end;
$$;

-- -------------------------------------------------------------------------------------------
-- The shared checks, widened for team managers
-- -------------------------------------------------------------------------------------------

create or replace function public.is_manager()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.profiles where id = auth.uid() and is_active and not must_change_password and role in ('lead', 'team_manager', 'admin')) $$;

-- Yourself, your own contributors, or (a team manager) anyone in your program.
create or replace function public.is_own_or_attached(profile_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_active_user() and (
    profile_id = auth.uid()
    or exists (select 1 from public.profiles where id = profile_id and lead_id = auth.uid())
    or public.in_my_program(profile_id)
  )
$$;

-- A project you lead, or (a team manager) one led by a lead in your program.
create or replace function public.is_project_lead(target_project_id bigint)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.project_leads where project_id = target_project_id and lead_id = auth.uid())
    or (
      public.is_team_manager()
      and exists (select 1 from public.project_leads pl where pl.project_id = target_project_id and public.in_my_program(pl.lead_id))
    )
$$;

-- Audits are for RST: an RST lead, or the RST team manager.
create or replace function public.is_rst_lead()
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_manager() and (
    exists (select 1 from public.team_features f where f.lead_id = auth.uid() and f.program = 'rst')
    or (public.is_team_manager() and (select program from public.profiles where id = auth.uid()) = 'rst')
  )
$$;

-- -------------------------------------------------------------------------------------------
-- Role changes. Admins change anything. A team manager switches people in their program between
-- contributor and lead, and keeps every contributor they touch under one of their program's leads.
-- Someone they make a lead gets a team in their program.
-- -------------------------------------------------------------------------------------------

create or replace function public.prevent_non_admin_role_change()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_program text;
begin
  if auth.role() not in ('anon', 'authenticated') or public.is_admin() then
    return new;
  end if;

  if new.program is distinct from old.program then
    raise exception 'Only admins can change a team manager''s program.';
  end if;

  if not public.is_team_manager() then
    if new.role is distinct from old.role then
      raise exception 'Only admins can change a user''s role.';
    end if;
    return new;
  end if;

  if new.role is distinct from old.role
    and (old.role not in ('contributor', 'lead') or new.role not in ('contributor', 'lead')) then
    raise exception 'A team manager can only switch people between contributor and lead.';
  end if;

  if new.role = 'contributor'
    and (new.lead_id is distinct from old.lead_id or new.role is distinct from old.role)
    and (new.lead_id is null or not public.manages_team(new.lead_id)) then
    raise exception 'Pick a lead from your program.';
  end if;

  if new.role = 'lead' and old.role is distinct from 'lead' then
    select program into v_program from public.profiles where id = auth.uid();
    new.lead_id := null;
    insert into public.team_features (lead_id, program, updated_by)
    values (new.id, v_program, auth.uid())
    on conflict (lead_id) do update set program = excluded.program, updated_by = excluded.updated_by, updated_at = now();
  end if;

  return new;
end;
$$;

-- An admin sets a team manager's program.
create or replace function public.set_team_manager_program(p_user_id uuid, p_program text)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_name text;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can change a team manager''s program.';
  end if;
  if p_program is null or p_program not in ('bootcamp', 'rst') then
    raise exception 'Choose Bootcamp or RST.';
  end if;
  select name into v_name from public.profiles where id = p_user_id and role = 'team_manager';
  if v_name is null then
    raise exception 'That team manager was not found.';
  end if;
  update public.profiles set program = p_program where id = p_user_id;
  perform public.write_audit('setting_changed', p_user_id,
    'Made ' || v_name || ' team manager of ' || case when p_program = 'rst' then 'RST' else 'Bootcamp' end,
    jsonb_build_object('setting', 'team_manager_program', 'user_id', p_user_id, 'program', p_program));
end;
$$;

revoke execute on function public.set_team_manager_program(uuid, text) from public, anon;
grant execute on function public.set_team_manager_program(uuid, text) to authenticated;

-- -------------------------------------------------------------------------------------------
-- Functions that checked "the lead is me" directly. Each is its latest definition (the file is
-- named above it) with that check widened to manages_team() or is_own_or_attached().
-- -------------------------------------------------------------------------------------------

-- From 20261106_team_attendance_public.sql.
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
  if not (public.is_admin() or (public.is_manager() and public.manages_team(p_lead_id))) then
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

-- From 20261106_team_cts_trainer.sql.
create or replace function public.set_team_cts_trainer(p_lead_id uuid, p_trainer text)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_name text;
  v_trainer text := nullif(lower(trim(coalesce(p_trainer, ''))), '');
  v_old text;
begin
  if not (public.is_admin() or (public.is_manager() and public.manages_team(p_lead_id))) then
    raise exception 'You can only change your own team''s features.';
  end if;
  if char_length(v_trainer) > 200 then
    raise exception 'That trainer name is too long.';
  end if;
  select name into v_name from public.profiles where id = p_lead_id and role = 'lead';
  if v_name is null then
    raise exception 'That lead was not found.';
  end if;

  select f.cts_trainer into v_old from public.team_features f where f.lead_id = p_lead_id;
  if v_old is not distinct from v_trainer then
    return;
  end if;

  insert into public.team_features (lead_id, cts_trainer, updated_by)
  values (p_lead_id, v_trainer, auth.uid())
  on conflict (lead_id) do update
    set cts_trainer = excluded.cts_trainer,
        updated_by = excluded.updated_by,
        updated_at = now();

  perform public.write_audit('setting_changed', p_lead_id,
    case when v_trainer is null then 'Cleared the CTS trainer' else 'Set the CTS trainer to "' || v_trainer || '"' end
      || ' for ' || v_name || '''s team',
    jsonb_build_object('setting', 'team_cts_trainer', 'lead_id', p_lead_id, 'cts_trainer', v_trainer));
end;
$$;

-- From 20261109_task_backup_form.sql.
create or replace function public.set_team_backup_form(p_lead_id uuid, p_enabled boolean)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_name text;
  v_old boolean;
begin
  if not (public.is_admin() or (public.is_manager() and public.manages_team(p_lead_id))) then
    raise exception 'You can only change your own team''s features.';
  end if;
  if p_enabled is null then
    raise exception 'Choose on or off.';
  end if;
  select name into v_name from public.profiles where id = p_lead_id and role = 'lead';
  if v_name is null then
    raise exception 'That lead was not found.';
  end if;

  select coalesce(f.backup_form_enabled, false) into v_old
  from (select 1) one left join public.team_features f on f.lead_id = p_lead_id;
  if v_old = p_enabled then
    return;
  end if;

  insert into public.team_features (lead_id, backup_form_enabled, updated_by)
  values (p_lead_id, p_enabled, auth.uid())
  on conflict (lead_id) do update
    set backup_form_enabled = excluded.backup_form_enabled,
        updated_by = excluded.updated_by,
        updated_at = now();

  perform public.write_audit('setting_changed', p_lead_id,
    case when p_enabled then 'Turned on' else 'Turned off' end || ' the Back Up Task Tracker form for ' || v_name || '''s team',
    jsonb_build_object('setting', 'team_backup_form', 'lead_id', p_lead_id, 'backup_form_enabled', p_enabled));
end;
$$;

-- From 20261111_team_attendance_gform.sql.
create or replace function public.set_team_attendance_gform(p_lead_id uuid, p_enabled boolean)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_name text;
  v_old boolean;
begin
  if not (public.is_admin() or (public.is_manager() and public.manages_team(p_lead_id))) then
    raise exception 'You can only change your own team''s features.';
  end if;
  if p_enabled is null then
    raise exception 'Choose on or off.';
  end if;
  select name into v_name from public.profiles where id = p_lead_id and role = 'lead';
  if v_name is null then
    raise exception 'That lead was not found.';
  end if;

  select coalesce(f.attendance_gform_enabled, true) into v_old
  from (select 1) one left join public.team_features f on f.lead_id = p_lead_id;
  if v_old = p_enabled then
    return;
  end if;

  insert into public.team_features (lead_id, attendance_gform_enabled, updated_by)
  values (p_lead_id, p_enabled, auth.uid())
  on conflict (lead_id) do update
    set attendance_gform_enabled = excluded.attendance_gform_enabled,
        updated_by = excluded.updated_by,
        updated_at = now();

  perform public.write_audit('setting_changed', p_lead_id,
    case when p_enabled then 'Turned on' else 'Turned off' end || ' the attendance Google Form for ' || v_name || '''s team',
    jsonb_build_object('setting', 'team_attendance_gform', 'lead_id', p_lead_id, 'attendance_gform_enabled', p_enabled));
end;
$$;

-- From 20261021_attendance_close_time.sql.
create or replace function public.set_attendance_closes_min(p_lead_id uuid, p_closes_min int)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_team text;
begin
  if p_closes_min is not null and (p_closes_min < 361 or p_closes_min > 1439) then
    raise exception 'Pick a time after 6:00 AM and before midnight.';
  end if;

  if p_lead_id is null then
    if not public.is_admin() then
      raise exception 'Only an admin can change the default closing time.';
    end if;
    if p_closes_min is null then
      raise exception 'Pick a closing time.';
    end if;
    update public.app_settings
    set attendance_closes_min = p_closes_min, updated_by = auth.uid(), updated_at = now()
    where id;
    perform public.write_audit('setting_changed', null,
      'Set attendance to close at ' || public.attendance_time_label(p_closes_min) || ' by default',
      jsonb_build_object('setting', 'attendance_closes_min', 'value', p_closes_min));
    return;
  end if;

  if not (public.is_admin() or (public.is_manager() and public.manages_team(p_lead_id))) then
    raise exception 'You can only change your own team''s closing time.';
  end if;
  select name into v_team from public.profiles where id = p_lead_id and role = 'lead';
  if v_team is null then
    raise exception 'That team was not found.';
  end if;

  if p_closes_min is null then
    delete from public.team_attendance_settings where lead_id = p_lead_id;
  else
    insert into public.team_attendance_settings (lead_id, closes_min, updated_by)
    values (p_lead_id, p_closes_min, auth.uid())
    on conflict (lead_id) do update
      set closes_min = excluded.closes_min, updated_by = excluded.updated_by, updated_at = now();
  end if;
  perform public.write_audit('setting_changed', p_lead_id,
    case when p_closes_min is null
      then 'Put ' || v_team || '''s team back on the default attendance closing time'
      else 'Set attendance to close at ' || public.attendance_time_label(p_closes_min) || ' for ' || v_team || '''s team'
    end,
    jsonb_build_object('setting', 'attendance_closes_min', 'lead_id', p_lead_id, 'value', p_closes_min));
end;
$$;

-- From 20261023_lead_shifts.sql.
create or replace function public.set_lead_shift(p_lead_id uuid, p_starts_min int, p_ends_min int)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_name text;
begin
  if not (public.is_admin() or (public.is_manager() and public.manages_team(p_lead_id))) then
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

-- From 20261021_attendance_close_time.sql.
create or replace function public.attendance_close_times()
returns table (lead_id uuid, closes_min int) language sql stable security definer set search_path = public
as $$
  select null::uuid, s.attendance_closes_min from public.app_settings s where s.id and public.is_manager()
  union all
  select t.lead_id, t.closes_min from public.team_attendance_settings t
  where public.is_admin() or (public.is_manager() and public.manages_team(t.lead_id))
$$;

-- From 20261023_lead_shifts.sql.
create or replace function public.lead_shifts()
returns table (lead_id uuid, starts_min int, ends_min int)
language sql stable security definer set search_path = public
as $$
  select s.lead_id, s.starts_min, s.ends_min from public.lead_shifts s
  where public.is_admin() or (public.is_manager() and public.manages_team(s.lead_id))
$$;

-- From 20261111_team_attendance_gform.sql.
create or replace function public.team_features_list()
returns table (lead_id uuid, cts_enabled boolean, attendance_enabled boolean, attendance_public boolean, cts_trainer text, backup_form_enabled boolean,
  program text, messaging_enabled boolean, attendance_gform_enabled boolean)
language sql stable security definer set search_path = public
as $$
  select f.lead_id, f.cts_enabled, f.attendance_enabled, f.attendance_public, f.cts_trainer, f.backup_form_enabled, f.program, f.messaging_enabled,
    f.attendance_gform_enabled
  from public.team_features f
  where public.is_admin() or (public.is_manager() and public.manages_team(f.lead_id))
$$;

-- From 20261014_rewards.sql.
create or replace function public.can_manage_reward(p_team_lead_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_admin() or (public.is_manager() and public.manages_team(p_team_lead_id))
$$;

-- From 20261014_rewards.sql.
create or replace function public.can_view_reward(p_team_lead_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_active_user() and (
    public.is_admin()
    or p_team_lead_id is null
    or public.manages_team(p_team_lead_id)
    or exists (select 1 from public.profiles me where me.id = auth.uid() and me.lead_id = p_team_lead_id)
  )
$$;

-- From 20260929_team_features.sql.
create or replace function public.can_post_announcement(p_audience text, p_team_lead_id uuid, p_project_id bigint)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_admin() or (
    public.is_manager() and (
      (p_audience = 'team' and public.manages_team(p_team_lead_id))
      or (p_audience = 'project' and public.is_project_lead(p_project_id))
    )
  )
$$;

-- From 20260929_team_features.sql.
create or replace function public.announcement_addressed_to_me(p_audience text, p_team_lead_id uuid, p_project_id bigint)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_active_user() and (
    p_audience = 'everyone'
    or (p_audience = 'team' and (
      public.manages_team(p_team_lead_id)
      or exists (select 1 from public.profiles me where me.id = auth.uid() and me.lead_id = p_team_lead_id)
    ))
    or (p_audience = 'project' and (
      public.is_project_lead(p_project_id)
      or exists (
        select 1 from public.profiles me join public.project_leads pl on pl.lead_id = me.lead_id
        where me.id = auth.uid() and pl.project_id = p_project_id
      )
    ))
  )
$$;

-- From 20261014_review_hardening.sql.
create or replace function public.can_log_for_email(p_email text)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_admin()
    or lower(p_email) = lower(public.own_email())
    or (
      public.is_manager()
      and exists (select 1 from public.profiles p where lower(p.email) = lower(p_email) and public.is_own_or_attached(p.id))
    )
$$;

-- From 20261113_edit_task_timer.sql.
create or replace function public.set_task_timer_seconds(p_submission_id bigint, p_seconds int)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_row public.task_submissions;
  v_current int;
  v_manages boolean;
begin
  if p_seconds is null or p_seconds < 0 or p_seconds > 86400 then
    raise exception 'Time must be between 0 and 24 hours.';
  end if;

  select * into v_row from public.task_submissions where id = p_submission_id for update;
  if not found then
    raise exception 'Task not found.';
  end if;

  v_current := v_row.timer_elapsed_seconds
    + coalesce(greatest(0, extract(epoch from now() - v_row.timer_started_at)::int), 0);
  v_manages := public.is_admin()
    or (public.is_manager() and public.is_own_or_attached(v_row.user_id));

  if not v_manages then
    if v_row.user_id is distinct from auth.uid() or not public.is_active_user() then
      raise exception 'You can''t change the time on this task.';
    end if;
    if p_seconds > v_current then
      raise exception 'You can only lower your own time. Ask your lead to add time.';
    end if;
  end if;

  if v_row.timer_started_at is not null then
    -- Pause (the timer trigger banks the run), then restart from the new time.
    update public.task_submissions set timer_started_at = null where id = p_submission_id;
    update public.task_submissions set timer_elapsed_seconds = p_seconds, timer_started_at = now() where id = p_submission_id;
  else
    update public.task_submissions set timer_elapsed_seconds = p_seconds where id = p_submission_id;
  end if;
end;
$$;

-- From 20261111_presence_6_minutes.sql.
create or replace function public.directory()
returns table (id uuid, name text, is_active boolean, last_seen_at timestamptz, avatar_url text, role text, is_bot boolean, email text, lead_id uuid)
language sql stable security definer set search_path = public
as $$
  select p.id, p.name, p.is_active,
    case when public.is_manager() or p.last_seen_at > now() - interval '6 minutes' then p.last_seen_at end,
    p.avatar_url, p.role, p.is_bot,
    case when public.is_manager() then p.email end,
    case when public.is_manager() then p.lead_id end
  from public.profiles p
  where p.is_active and public.is_active_user() and (
    public.is_manager()
    or p.is_bot
    or p.role in ('admin', 'team_manager')
    or p.last_seen_at > now() - interval '6 minutes'
    or p.id = (select me.lead_id from public.profiles me where me.id = auth.uid())
    or exists (
      select 1 from public.messages m
      where (m.sender_id = auth.uid() and m.recipient_id = p.id)
         or (m.recipient_id = auth.uid() and m.sender_id = p.id)
    )
  )
$$;

commit;

notify pgrst, 'reload schema';
