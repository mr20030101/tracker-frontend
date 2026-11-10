-- ============================================================================================
-- Per team, whether filed attendance goes to the attendance Google Form (attendance_gform_enabled,
-- on until turned off). The sender (api/attendance-google-form) checks it before posting, so a team
-- with it off files attendance in the Tracker only. Set in Settings → Team by the lead themselves or
-- an admin, and recorded in the Activity Log. Run after 20261111_cb_project_assignments.sql.
-- ============================================================================================

alter table public.team_features add column if not exists attendance_gform_enabled boolean not null default true;

-- Same as in 20261111_messaging_off_all.sql, with the new setting.
drop function if exists public.team_features_for(uuid);
create function public.team_features_for(p_user_id uuid)
returns table (cts_enabled boolean, attendance_enabled boolean, attendance_public boolean, cts_trainer text, backup_form_enabled boolean, program text,
  messaging_enabled boolean, attendance_gform_enabled boolean)
language sql stable security definer set search_path = public
as $$
  select coalesce(f.cts_enabled, true), coalesce(f.attendance_enabled, true), coalesce(f.attendance_public, false), f.cts_trainer,
    coalesce(f.backup_form_enabled, false), coalesce(f.program, 'bootcamp'),
    coalesce(f.messaging_enabled, coalesce(p.role not in ('lead', 'contributor'), true)),
    coalesce(f.attendance_gform_enabled, true)
  from (select 1) one
  left join public.profiles p on p.id = p_user_id and public.is_active_user()
  left join public.team_features f
    on f.lead_id = case when p.role = 'lead' then p.id when p.role = 'contributor' then p.lead_id end
$$;

revoke execute on function public.team_features_for(uuid) from public, anon;
grant execute on function public.team_features_for(uuid) to authenticated;

-- Same as in 20261110_team_messaging.sql, with the new setting.
drop function if exists public.team_features_list();
create function public.team_features_list()
returns table (lead_id uuid, cts_enabled boolean, attendance_enabled boolean, attendance_public boolean, cts_trainer text, backup_form_enabled boolean,
  program text, messaging_enabled boolean, attendance_gform_enabled boolean)
language sql stable security definer set search_path = public
as $$
  select f.lead_id, f.cts_enabled, f.attendance_enabled, f.attendance_public, f.cts_trainer, f.backup_form_enabled, f.program, f.messaging_enabled,
    f.attendance_gform_enabled
  from public.team_features f
  where public.is_admin() or (public.is_manager() and f.lead_id = auth.uid())
$$;

revoke execute on function public.team_features_list() from public, anon;
grant execute on function public.team_features_list() to authenticated;

-- Turns a team's sending to the attendance Google Form on or off: the lead themselves, or an admin.
create or replace function public.set_team_attendance_gform(p_lead_id uuid, p_enabled boolean)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_name text;
  v_old boolean;
begin
  if not (public.is_admin() or (public.is_manager() and p_lead_id = auth.uid())) then
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

revoke execute on function public.set_team_attendance_gform(uuid, boolean) from public, anon;
grant execute on function public.set_team_attendance_gform(uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
