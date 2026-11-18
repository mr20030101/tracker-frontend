-- App-wide switches, changed by admins on the App Settings page (src/pages/AppSettings.tsx):
--   * bulk_import:  the Bulk Import button on the Task Log and contributor pages. Off to start.
--   * hiring:       when off, the Hiring page is hidden, every apply link says applications are
--                   closed, and new applications are refused. On to start.
--   * audits:       the Audits page. On to start.
--   * data_quality: the Data Quality page. On to start.
-- Run after 20261020_attendance_photo_setting.sql.

alter table public.app_settings
  add column if not exists bulk_import_enabled boolean not null default false,
  add column if not exists hiring_enabled boolean not null default true,
  add column if not exists audits_enabled boolean not null default true,
  add column if not exists data_quality_enabled boolean not null default true;

-- Every switch, for any signed-in person: the app needs them to know what to show.
create or replace function public.app_switches()
returns jsonb language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'bulk_import', s.bulk_import_enabled,
    'hiring', s.hiring_enabled,
    'audits', s.audits_enabled,
    'data_quality', s.data_quality_enabled
  )
  from public.app_settings s where s.id
$$;

revoke execute on function public.app_switches() from public, anon;
grant execute on function public.app_switches() to authenticated;

-- Admins turn one switch on or off; recorded in the Activity Log.
create or replace function public.set_app_switch(p_key text, p_enabled boolean)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_label text;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can change this.';
  end if;
  if p_enabled is null then
    raise exception 'Choose on or off.';
  end if;
  case p_key
    when 'bulk_import' then update public.app_settings set bulk_import_enabled = p_enabled where id; v_label := 'bulk import of tasks';
    when 'hiring' then update public.app_settings set hiring_enabled = p_enabled where id; v_label := 'hiring';
    when 'audits' then update public.app_settings set audits_enabled = p_enabled where id; v_label := 'Audits';
    when 'data_quality' then update public.app_settings set data_quality_enabled = p_enabled where id; v_label := 'Data Quality';
    else raise exception 'Unknown setting.';
  end case;
  update public.app_settings set updated_by = auth.uid(), updated_at = now() where id;
  perform public.write_audit('setting_changed', null,
    (case when p_enabled then 'Turned on ' else 'Turned off ' end) || v_label,
    jsonb_build_object('setting', p_key || '_enabled', 'value', p_enabled));
end;
$$;

revoke execute on function public.set_app_switch(text, boolean) from public, anon;
grant execute on function public.set_app_switch(text, boolean) to authenticated;

-- ------------------------------------------------------------
-- Hiring off closes the public apply links too.
-- ------------------------------------------------------------
create or replace function public.hiring_enabled()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce((select hiring_enabled from public.app_settings where id), true) $$;

revoke execute on function public.hiring_enabled() from public, anon, authenticated;

-- A lead's form only counts as open while hiring is on.
create or replace function public.hiring_lead_info(p_lead_id uuid)
returns table (name text, accepting boolean)
language sql stable security definer set search_path = public
as $$
  select p.name, p.accepting_applications and public.hiring_enabled() from public.profiles p
  where p.id = p_lead_id and p.role = 'lead' and p.is_active
$$;

grant execute on function public.hiring_lead_info(uuid) to anon, authenticated;

-- However an application arrives, it's refused while hiring is off.
create or replace function public.refuse_application_when_hiring_off()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if not public.hiring_enabled() then
    raise exception 'We''re not accepting applications right now.';
  end if;
  return new;
end;
$$;

revoke execute on function public.refuse_application_when_hiring_off() from public, anon, authenticated;

drop trigger if exists hiring_applications_hiring_enabled on public.hiring_applications;
create trigger hiring_applications_hiring_enabled
  before insert on public.hiring_applications
  for each row execute function public.refuse_application_when_hiring_off();
