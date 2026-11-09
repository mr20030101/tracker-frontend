-- ============================================================================================
-- Each lead's team is in a program: Bootcamp (everyone so far) or RST (Jay Anne's team). RST
-- teams file extensions on the "RST Task Extension Form" instead of the Scale Reclaim / Extend
-- form. Set by an admin in Settings → Team. Run after 20261109_task_backup_form.sql.
-- ============================================================================================

alter table public.team_features add column if not exists program text not null default 'bootcamp'
  check (program in ('bootcamp', 'rst'));

drop function if exists public.team_features_for(uuid);
create function public.team_features_for(p_user_id uuid)
returns table (cts_enabled boolean, attendance_enabled boolean, attendance_public boolean, cts_trainer text, backup_form_enabled boolean, program text)
language sql stable security definer set search_path = public
as $$
  select coalesce(f.cts_enabled, true), coalesce(f.attendance_enabled, true), coalesce(f.attendance_public, false), f.cts_trainer,
    coalesce(f.backup_form_enabled, false), coalesce(f.program, 'bootcamp')
  from (select 1) one
  left join public.profiles p on p.id = p_user_id and public.is_active_user()
  left join public.team_features f
    on f.lead_id = case when p.role = 'lead' then p.id when p.role = 'contributor' then p.lead_id end
$$;

revoke execute on function public.team_features_for(uuid) from public, anon;
grant execute on function public.team_features_for(uuid) to authenticated;

drop function if exists public.team_features_list();
create function public.team_features_list()
returns table (lead_id uuid, cts_enabled boolean, attendance_enabled boolean, attendance_public boolean, cts_trainer text, backup_form_enabled boolean, program text)
language sql stable security definer set search_path = public
as $$
  select f.lead_id, f.cts_enabled, f.attendance_enabled, f.attendance_public, f.cts_trainer, f.backup_form_enabled, f.program
  from public.team_features f
  where public.is_admin() or (public.is_manager() and f.lead_id = auth.uid())
$$;

revoke execute on function public.team_features_list() from public, anon;
grant execute on function public.team_features_list() to authenticated;

-- Moves a team to Bootcamp or RST. Admins only. Recorded in the Activity Log.
create or replace function public.set_team_program(p_lead_id uuid, p_program text)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_name text;
  v_old text;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can change a team''s program.';
  end if;
  if p_program is null or p_program not in ('bootcamp', 'rst') then
    raise exception 'Choose Bootcamp or RST.';
  end if;
  select name into v_name from public.profiles where id = p_lead_id and role = 'lead';
  if v_name is null then
    raise exception 'That lead was not found.';
  end if;

  select coalesce(f.program, 'bootcamp') into v_old
  from (select 1) one left join public.team_features f on f.lead_id = p_lead_id;
  if v_old = p_program then
    return;
  end if;

  insert into public.team_features (lead_id, program, updated_by)
  values (p_lead_id, p_program, auth.uid())
  on conflict (lead_id) do update
    set program = excluded.program,
        updated_by = excluded.updated_by,
        updated_at = now();

  perform public.write_audit('setting_changed', p_lead_id,
    'Moved ' || v_name || '''s team to ' || case when p_program = 'rst' then 'RST' else 'Bootcamp' end,
    jsonb_build_object('setting', 'team_program', 'lead_id', p_lead_id, 'program', p_program));
end;
$$;

revoke execute on function public.set_team_program(uuid, text) from public, anon;
grant execute on function public.set_team_program(uuid, text) to authenticated;

-- Jay Anne's team is RST.
insert into public.team_features (lead_id, program)
select id, 'rst' from public.profiles
where role = 'lead' and lower(trim(name)) = 'jay anne r. tan'
on conflict (lead_id) do update set program = 'rst', updated_at = now();

select p.name, coalesce(f.program, 'bootcamp') as program
from public.profiles p left join public.team_features f on f.lead_id = p.id
where p.role = 'lead' and p.is_active order by p.name;
