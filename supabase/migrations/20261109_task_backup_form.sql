-- ============================================================================================
-- "Back Up Task Tracker Remote" Google Form: every task a contributor finishes (Submitted,
-- Rejected/SBQ or Expired) is sent to it once, in the background, for teams that switch it on in
-- Settings → Team (off by default). The send is done by the Vercel Function api/task-backup-form
-- (src/lib/taskBackupForm.ts), which this trigger calls through pg_net, so every way a task's
-- status changes (the form, Task Log, the timer, the browser extension, the offline queue) is
-- covered. The function records how it went on the task. Run after 20261106_team_cts_trainer.sql.
--
-- Needs two rows in app_secrets, set by hand (not committed):
--   task_backup_form_url    = https://greyowlstracker.space/api/task-backup-form
--   task_backup_form_secret = the same value as Vercel's TASK_BACKUP_FORM_SECRET
-- Without them nothing is sent.
-- ============================================================================================

-- A contributor rejecting a task or sending it back to the queue in Remotasks.
alter table public.task_submissions drop constraint if exists task_submissions_status_check;
alter table public.task_submissions add constraint task_submissions_status_check
  check (status in ('submitted', 'in_progress', 'empty', 'expired', 'claimed_by_another', 'rejected'));

-- When the task reached the form; why the last try failed; when the sender last wrote back (so
-- the trigger can tell its own write from someone editing the task).
alter table public.task_submissions add column if not exists backup_form_sent_at timestamptz;
alter table public.task_submissions add column if not exists backup_form_error text check (char_length(backup_form_error) <= 500);
alter table public.task_submissions add column if not exists backup_form_attempted_at timestamptz;

alter table public.team_features add column if not exists backup_form_enabled boolean not null default false;

-- Only the sender (service role) writes the backup_form_* columns.
create or replace function public.task_backup_form_guard()
returns trigger language plpgsql set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.backup_form_sent_at := null;
      new.backup_form_error := null;
      new.backup_form_attempted_at := null;
    else
      new.backup_form_sent_at := old.backup_form_sent_at;
      new.backup_form_error := old.backup_form_error;
      new.backup_form_attempted_at := old.backup_form_attempted_at;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists task_backup_form_guard on public.task_submissions;
create trigger task_backup_form_guard before insert or update on public.task_submissions
  for each row execute function public.task_backup_form_guard();

-- Asks the sender to send a task when it becomes Submitted, Rejected/SBQ or Expired, or when a task
-- whose last send failed is edited (so fixing it retries). Only tasks dated today or yesterday
-- (Manila), so a bulk import of old tasks doesn't flood the form, and only for teams that have it on.
create or replace function public.task_backup_form_notify()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_url text;
  v_secret text;
begin
  if new.status not in ('submitted', 'expired', 'rejected') or new.backup_form_sent_at is not null then
    return null;
  end if;
  if tg_op = 'UPDATE' then
    if new.backup_form_attempted_at is distinct from old.backup_form_attempted_at then
      return null;
    end if;
    if new.status = old.status and old.backup_form_attempted_at is null then
      return null;
    end if;
  end if;
  if coalesce(new.date, v_today) < v_today - 1 then
    return null;
  end if;
  if not exists (
    select 1 from public.profiles p
    join public.team_features f
      on f.lead_id = case when p.role = 'lead' then p.id when p.role = 'contributor' then p.lead_id end
    where lower(p.email) = lower(new.cb_email) and f.backup_form_enabled
  ) then
    return null;
  end if;

  select value into v_url from public.app_secrets where key = 'task_backup_form_url';
  select value into v_secret from public.app_secrets where key = 'task_backup_form_secret';
  if v_url is null or v_secret is null then
    return null;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
    body := jsonb_build_object('submission_id', new.id)
  );
  return null;
end;
$$;

revoke execute on function public.task_backup_form_notify() from public, anon, authenticated;

drop trigger if exists task_backup_form_notify on public.task_submissions;
create trigger task_backup_form_notify after insert or update on public.task_submissions
  for each row execute function public.task_backup_form_notify();

drop function if exists public.team_features_for(uuid);
create function public.team_features_for(p_user_id uuid)
returns table (cts_enabled boolean, attendance_enabled boolean, attendance_public boolean, cts_trainer text, backup_form_enabled boolean)
language sql stable security definer set search_path = public
as $$
  select coalesce(f.cts_enabled, true), coalesce(f.attendance_enabled, true), coalesce(f.attendance_public, false), f.cts_trainer,
    coalesce(f.backup_form_enabled, false)
  from (select 1) one
  left join public.profiles p on p.id = p_user_id and public.is_active_user()
  left join public.team_features f
    on f.lead_id = case when p.role = 'lead' then p.id when p.role = 'contributor' then p.lead_id end
$$;

revoke execute on function public.team_features_for(uuid) from public, anon;
grant execute on function public.team_features_for(uuid) to authenticated;

drop function if exists public.team_features_list();
create function public.team_features_list()
returns table (lead_id uuid, cts_enabled boolean, attendance_enabled boolean, attendance_public boolean, cts_trainer text, backup_form_enabled boolean)
language sql stable security definer set search_path = public
as $$
  select f.lead_id, f.cts_enabled, f.attendance_enabled, f.attendance_public, f.cts_trainer, f.backup_form_enabled from public.team_features f
  where public.is_admin() or (public.is_manager() and f.lead_id = auth.uid())
$$;

revoke execute on function public.team_features_list() from public, anon;
grant execute on function public.team_features_list() to authenticated;

-- Turns a team's sending to the Back Up Task Tracker form on or off: the lead themselves, or an
-- admin. Recorded in the Activity Log. Tasks finished while it was off aren't sent afterwards.
create or replace function public.set_team_backup_form(p_lead_id uuid, p_enabled boolean)
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

revoke execute on function public.set_team_backup_form(uuid, boolean) from public, anon;
grant execute on function public.set_team_backup_form(uuid, boolean) to authenticated;
