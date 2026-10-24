-- ============================================================================================
-- A timer on each task: how long someone has spent on it. It starts by itself when a contributor
-- logs a task that's in progress, and they can start and pause it by hand. It stops when the task
-- is no longer in progress (submitted, expired, ...). Only one runs at a time per person: starting
-- one pauses the others. Run after 20261023_bad_video_any_time.sql.
-- ============================================================================================

-- Running while timer_started_at is set; timer_elapsed_seconds is the time banked from earlier runs.
alter table public.task_submissions
  add column if not exists timer_started_at timestamptz,
  add column if not exists timer_elapsed_seconds int not null default 0 check (timer_elapsed_seconds >= 0);

-- The app starts a timer by setting timer_started_at (to any value) and pauses it by clearing it;
-- this keeps the times on the server's clock and banks the elapsed time on a pause.
create or replace function public.task_submissions_timer()
returns trigger language plpgsql set search_path = public
as $$
begin
  -- A task that isn't in progress has nothing left to time.
  if new.status <> 'in_progress' then
    new.timer_started_at := null;
  end if;

  if tg_op = 'UPDATE' and old.timer_started_at is not null then
    if new.timer_started_at is null then
      new.timer_elapsed_seconds := old.timer_elapsed_seconds + greatest(0, extract(epoch from now() - old.timer_started_at)::int);
    else
      -- Still running: keep the time it started.
      new.timer_started_at := old.timer_started_at;
    end if;
  elsif new.timer_started_at is not null then
    new.timer_started_at := now();
    -- One timer at a time: pause the person's others (this trigger banks their time).
    update public.task_submissions
    set timer_started_at = null
    where user_id = new.user_id and timer_started_at is not null and id is distinct from new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists task_submissions_timer on public.task_submissions;
create trigger task_submissions_timer before insert or update of timer_started_at, status on public.task_submissions
  for each row execute function public.task_submissions_timer();
