-- ============================================================================================
-- The RST team's task sheet ("Aloha OTS") has columns the app didn't keep: the task's Density,
-- Progress % and # of Frames, and the time it was finished. RST contributors fill the
-- first three in on the task form (all optional); the Task Log exports them in the sheet's column
-- order for RST teams (src/lib/rstTaskExport.ts); its Link is made from the task ID. Time Started
-- is the task's created_at.
-- ended_at is set here, on the server's clock, when a task becomes Submitted (and its Progress
-- goes to 100%), and cleared if it's moved off Submitted. Run after 20261127_attendance_screenshot_optional.sql.
-- ============================================================================================

alter table public.task_submissions
  add column if not exists density text check (density in ('easy', 'medium', 'complex')),
  add column if not exists progress_pct smallint check (progress_pct between 0 and 100),
  add column if not exists frames integer check (frames between 0 and 1000000),
  add column if not exists ended_at timestamptz;

-- A Task link field was in the first version of this file; the link comes from the task ID now.
alter table public.task_submissions drop column if exists task_link;

create or replace function public.task_submissions_ended_at()
returns trigger language plpgsql set search_path = public
as $$
begin
  if new.status = 'submitted' then
    if tg_op = 'INSERT' or old.status is distinct from 'submitted' then
      new.ended_at := now();
      new.progress_pct := 100;
    end if;
  elsif tg_op = 'UPDATE' and old.status = 'submitted' then
    new.ended_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists task_submissions_ended_at on public.task_submissions;
create trigger task_submissions_ended_at before insert or update of status on public.task_submissions
  for each row execute function public.task_submissions_ended_at();
