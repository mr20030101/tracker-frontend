-- ============================================================================================
-- Each project sets how long a task's timer can run (projects.timer_limit_minutes; blank means 3
-- hours, also used for a task with no project). Once a task's timer reaches its project's limit
-- (time banked plus the current run) the task is marked Expired and the timer stops at the limit.
-- A pg_cron job checks every minute, and the timer trigger also expires a task whose timer is
-- paused or started past the limit. Expiring goes through the usual status change, so the backup
-- form sees it like any other expired task. Run after 20261109_task_backup_form.sql.
-- ============================================================================================

create extension if not exists pg_cron;

alter table public.projects
  add column if not exists timer_limit_minutes integer check (timer_limit_minutes between 1 and 1440);

create or replace function public.task_timer_limit_seconds(p_project_id bigint)
returns int language sql stable security definer set search_path = public
as $$
  select coalesce((select timer_limit_minutes from public.projects where id = p_project_id), 180) * 60
$$;

create or replace function public.task_submissions_timer()
returns trigger language plpgsql set search_path = public
as $$
declare
  v_limit int := public.task_timer_limit_seconds(new.project_id);
begin
  if new.status <> 'in_progress' then
    new.timer_started_at := null;
  end if;

  if tg_op = 'UPDATE' and old.timer_started_at is not null then
    if new.timer_started_at is null then
      new.timer_elapsed_seconds := old.timer_elapsed_seconds + greatest(0, extract(epoch from now() - old.timer_started_at)::int);
    else
      new.timer_started_at := old.timer_started_at;
    end if;
  elsif new.timer_started_at is not null then
    new.timer_started_at := now();
    update public.task_submissions
    set timer_started_at = null
    where user_id = new.user_id and timer_started_at is not null and id is distinct from new.id;
  end if;

  if new.timer_elapsed_seconds >= v_limit then
    new.timer_elapsed_seconds := v_limit;
    new.timer_started_at := null;
    if new.status = 'in_progress' then
      new.status := 'expired';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists task_submissions_timer on public.task_submissions;
create trigger task_submissions_timer before insert or update of timer_started_at, status, project_id on public.task_submissions
  for each row execute function public.task_submissions_timer();

-- Expires every in-progress task whose timer has reached its project's limit. The update pauses
-- the timer, and the trigger above banks the time (capped at the limit) and sets the status.
create or replace function public.expire_overdue_task_timers()
returns int language plpgsql security definer set search_path = public
as $$
declare
  v_count int;
begin
  update public.task_submissions s
  set status = 'expired', timer_started_at = null
  where s.status = 'in_progress'
    and s.timer_elapsed_seconds + coalesce(greatest(0, extract(epoch from now() - s.timer_started_at)::int), 0)
      >= coalesce((select p.timer_limit_minutes from public.projects p where p.id = s.project_id), 180) * 60;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.expire_overdue_task_timers() from public, anon, authenticated;
revoke execute on function public.task_timer_limit_seconds(bigint) from public, anon;
grant execute on function public.task_timer_limit_seconds(bigint) to authenticated;

create index if not exists task_submissions_in_progress_timer_idx
  on public.task_submissions (id) where status = 'in_progress';

select cron.unschedule(jobid) from cron.job where jobname = 'expire-overdue-task-timers';
select cron.schedule('expire-overdue-task-timers', '* * * * *', $$ select public.expire_overdue_task_timers() $$);
