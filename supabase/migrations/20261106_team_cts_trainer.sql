-- ============================================================================================
-- CTS trainer per team: the CTS Form's "Under Trainer Team" answer, prefilled for a team's
-- contributors. Was hardcoded to Jay Anne for everyone, so CBs moved to Ina's team still went in
-- under Jay Anne. Set in Settings → Team, exactly as the option reads in the Google Form.
-- Run after 20261106_team_attendance_public.sql.
-- ============================================================================================

alter table public.team_features add column if not exists cts_trainer text
  check (cts_trainer is null or char_length(cts_trainer) between 1 and 200);

drop function if exists public.team_features_for(uuid);
create function public.team_features_for(p_user_id uuid)
returns table (cts_enabled boolean, attendance_enabled boolean, attendance_public boolean, cts_trainer text)
language sql stable security definer set search_path = public
as $$
  select coalesce(f.cts_enabled, true), coalesce(f.attendance_enabled, true), coalesce(f.attendance_public, false), f.cts_trainer
  from (select 1) one
  left join public.profiles p on p.id = p_user_id and public.is_active_user()
  left join public.team_features f
    on f.lead_id = case when p.role = 'lead' then p.id when p.role = 'contributor' then p.lead_id end
$$;

revoke execute on function public.team_features_for(uuid) from public, anon;
grant execute on function public.team_features_for(uuid) to authenticated;

drop function if exists public.team_features_list();
create function public.team_features_list()
returns table (lead_id uuid, cts_enabled boolean, attendance_enabled boolean, attendance_public boolean, cts_trainer text)
language sql stable security definer set search_path = public
as $$
  select f.lead_id, f.cts_enabled, f.attendance_enabled, f.attendance_public, f.cts_trainer from public.team_features f
  where public.is_admin() or (public.is_manager() and f.lead_id = auth.uid())
$$;

revoke execute on function public.team_features_list() from public, anon;
grant execute on function public.team_features_list() to authenticated;

-- Sets (or, with null/blank, clears) a team's CTS trainer: the lead themselves, or an admin.
-- Recorded in the Activity Log.
create or replace function public.set_team_cts_trainer(p_lead_id uuid, p_trainer text)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_name text;
  v_trainer text := nullif(lower(trim(coalesce(p_trainer, ''))), '');
  v_old text;
begin
  if not (public.is_admin() or (public.is_manager() and p_lead_id = auth.uid())) then
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

revoke execute on function public.set_team_cts_trainer(uuid, text) from public, anon;
grant execute on function public.set_team_cts_trainer(uuid, text) to authenticated;

-- The two teams' trainers, as their options read in the CTS form.
insert into public.team_features (lead_id, cts_trainer)
select id, 'garcia, ina dimaano' from public.profiles
where role = 'lead' and lower(trim(name)) ~ '^ina\M'
on conflict (lead_id) do update set cts_trainer = excluded.cts_trainer, updated_at = now();

insert into public.team_features (lead_id, cts_trainer)
select id, 'tan, jay-anne ratunil' from public.profiles
where role = 'lead' and lower(trim(name)) = 'jay anne r. tan'
on conflict (lead_id) do update set cts_trainer = excluded.cts_trainer, updated_at = now();
