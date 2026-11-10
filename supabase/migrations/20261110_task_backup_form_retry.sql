-- ============================================================================================
-- Retries tasks that couldn't be sent to the "Back Up Task Tracker Remote" Google Form. A pg_cron
-- job every 5 minutes asks the sender (api/task-backup-form) again for each finished task whose
-- last try failed: tasks dated today or yesterday (Manila), at least 5 minutes after the last try,
-- and at most MAX_TRIES tries in all, so a lasting problem (no trainer set) doesn't retry forever.
-- Editing the task still retries it straight away, as before. Run after 20261110_task_timer_limit.sql.
-- ============================================================================================

-- How many times the sender has tried this task. Written by the sender only (see the guard below).
alter table public.task_submissions add column if not exists backup_form_attempts integer not null default 0;

create or replace function public.task_backup_form_guard()
returns trigger language plpgsql set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.backup_form_sent_at := null;
      new.backup_form_error := null;
      new.backup_form_attempted_at := null;
      new.backup_form_attempts := 0;
    else
      new.backup_form_sent_at := old.backup_form_sent_at;
      new.backup_form_error := old.backup_form_error;
      new.backup_form_attempted_at := old.backup_form_attempted_at;
      new.backup_form_attempts := old.backup_form_attempts;
    end if;
  end if;
  return new;
end;
$$;

-- Finds the failed sends due a retry and asks the sender for each. Returns how many it asked for.
create or replace function public.retry_task_backup_form()
returns integer language plpgsql security definer set search_path = public
as $$
declare
  max_tries constant integer := 5;
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v_url text;
  v_secret text;
  v_id bigint;
  v_count integer := 0;
begin
  select value into v_url from public.app_secrets where key = 'task_backup_form_url';
  select value into v_secret from public.app_secrets where key = 'task_backup_form_secret';
  if v_url is null or v_secret is null then
    return 0;
  end if;

  for v_id in
    select t.id from public.task_submissions t
    where t.backup_form_sent_at is null
      and t.backup_form_error is not null
      and t.status in ('submitted', 'expired', 'rejected')
      -- The form requires a project; setting it on the task resends it (task_backup_form_notify).
      and t.project_id is not null
      and t.backup_form_attempts < max_tries
      and t.backup_form_attempted_at < now() - interval '5 minutes'
      and coalesce(t.date, v_today) >= v_today - 1
    order by t.backup_form_attempted_at
    limit 50
  loop
    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
      body := jsonb_build_object('submission_id', v_id)
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.retry_task_backup_form() from public, anon, authenticated;

create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'retry-task-backup-form';
select cron.schedule('retry-task-backup-form', '*/5 * * * *', $$ select public.retry_task_backup_form() $$);
