-- ============================================================================================
-- Task timers no longer have a limit and tasks no longer expire by themselves: a timer runs until
-- the contributor pauses it or the task stops being in progress. Undoes 20261110_task_timer_limit.sql
-- (the per-project Task Timer Limit, its pg_cron job and the cap in the timer trigger). Tasks
-- already marked Expired by it stay as they are. Run after 20261110_self_filed_task_issues.sql.
-- ============================================================================================

select cron.unschedule(jobid) from cron.job where jobname = 'expire-overdue-task-timers';
drop function if exists public.expire_overdue_task_timers();

-- Same as 20261024_task_timers.sql: no cap.
create or replace function public.task_submissions_timer()
returns trigger language plpgsql set search_path = public
as $$
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

  return new;
end;
$$;

drop function if exists public.task_timer_limit_seconds(bigint);
alter table public.projects drop column if exists timer_limit_minutes;

notify pgrst, 'reload schema';
