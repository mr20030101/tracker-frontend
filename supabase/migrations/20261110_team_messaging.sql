-- ============================================================================================
-- Messaging per team: an admin can switch chat off for a lead's team (the lead and their
-- contributors) in Settings → Team. Off, the team doesn't see Messages, the chat button or group
-- chats, and the database refuses messages sent by them or to them, so an open tab can't keep
-- chatting. On for every team until an admin turns it off. Run after 20261109_team_program.sql.
-- ============================================================================================

alter table public.team_features add column if not exists messaging_enabled boolean not null default true;

-- Whether a person may chat: false only when their team has messaging off. Admins and people
-- without a team always may.
create or replace function public.messaging_enabled_for(p_user_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce((
    select f.messaging_enabled
    from public.profiles p
    join public.team_features f
      on f.lead_id = case when p.role = 'lead' then p.id when p.role = 'contributor' then p.lead_id end
    where p.id = p_user_id
  ), true)
$$;

revoke execute on function public.messaging_enabled_for(uuid) from public, anon;
grant execute on function public.messaging_enabled_for(uuid) to authenticated;

-- Restrictive: on top of the existing insert policies, a message needs messaging on for its sender
-- and, for a direct message, its recipient.
drop policy if exists "messaging on for sender and recipient" on public.messages;
create policy "messaging on for sender and recipient" on public.messages as restrictive for insert to authenticated
  with check (public.messaging_enabled_for(sender_id) and public.messaging_enabled_for(recipient_id));

drop policy if exists "messaging on for sender" on public.group_messages;
create policy "messaging on for sender" on public.group_messages as restrictive for insert to authenticated
  with check (public.messaging_enabled_for(sender_id));

drop function if exists public.team_features_for(uuid);
create function public.team_features_for(p_user_id uuid)
returns table (cts_enabled boolean, attendance_enabled boolean, attendance_public boolean, cts_trainer text, backup_form_enabled boolean, program text,
  messaging_enabled boolean)
language sql stable security definer set search_path = public
as $$
  select coalesce(f.cts_enabled, true), coalesce(f.attendance_enabled, true), coalesce(f.attendance_public, false), f.cts_trainer,
    coalesce(f.backup_form_enabled, false), coalesce(f.program, 'bootcamp'), coalesce(f.messaging_enabled, true)
  from (select 1) one
  left join public.profiles p on p.id = p_user_id and public.is_active_user()
  left join public.team_features f
    on f.lead_id = case when p.role = 'lead' then p.id when p.role = 'contributor' then p.lead_id end
$$;

revoke execute on function public.team_features_for(uuid) from public, anon;
grant execute on function public.team_features_for(uuid) to authenticated;

drop function if exists public.team_features_list();
create function public.team_features_list()
returns table (lead_id uuid, cts_enabled boolean, attendance_enabled boolean, attendance_public boolean, cts_trainer text, backup_form_enabled boolean,
  program text, messaging_enabled boolean)
language sql stable security definer set search_path = public
as $$
  select f.lead_id, f.cts_enabled, f.attendance_enabled, f.attendance_public, f.cts_trainer, f.backup_form_enabled, f.program, f.messaging_enabled
  from public.team_features f
  where public.is_admin() or (public.is_manager() and f.lead_id = auth.uid())
$$;

revoke execute on function public.team_features_list() from public, anon;
grant execute on function public.team_features_list() to authenticated;

-- Turns a team's messaging on or off. Admins only. Recorded in the Activity Log.
create or replace function public.set_team_messaging(p_lead_id uuid, p_enabled boolean)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_name text;
  v_old boolean;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can turn a team''s messaging on or off.';
  end if;
  if p_enabled is null then
    raise exception 'Choose on or off.';
  end if;
  select name into v_name from public.profiles where id = p_lead_id and role = 'lead';
  if v_name is null then
    raise exception 'That lead was not found.';
  end if;

  select coalesce(f.messaging_enabled, true) into v_old
  from (select 1) one left join public.team_features f on f.lead_id = p_lead_id;
  if v_old = p_enabled then
    return;
  end if;

  insert into public.team_features (lead_id, messaging_enabled, updated_by)
  values (p_lead_id, p_enabled, auth.uid())
  on conflict (lead_id) do update
    set messaging_enabled = excluded.messaging_enabled,
        updated_by = excluded.updated_by,
        updated_at = now();

  perform public.write_audit('setting_changed', p_lead_id,
    case when p_enabled then 'Turned on' else 'Turned off' end || ' messaging for ' || v_name || '''s team',
    jsonb_build_object('setting', 'team_messaging', 'lead_id', p_lead_id, 'messaging_enabled', p_enabled));
end;
$$;

revoke execute on function public.set_team_messaging(uuid, boolean) from public, anon;
grant execute on function public.set_team_messaging(uuid, boolean) to authenticated;

-- So the API sees the new function and columns straight away.
notify pgrst, 'reload schema';
