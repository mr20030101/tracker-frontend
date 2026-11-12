-- ============================================================================================
-- A task's timer can be corrected by hand (set_task_timer_seconds). Leads (for their own team) and
-- admins can set any time; a contributor can only lower their own, e.g. after forgetting to pause,
-- since the time counts toward hours rendered. A running timer keeps running from the new time.
-- Clients can no longer write timer_elapsed_seconds directly. Run after 20261113_upload_ownership_checks.sql.
-- ============================================================================================

-- Sorts before task_submissions_timer, so it only sees what the client sent, not the time that
-- trigger banks on a pause.
create or replace function public.task_submissions_elapsed_guard()
returns trigger language plpgsql set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.timer_elapsed_seconds := 0;
    else
      new.timer_elapsed_seconds := old.timer_elapsed_seconds;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists task_submissions_elapsed_guard on public.task_submissions;
create trigger task_submissions_elapsed_guard before insert or update on public.task_submissions
  for each row execute function public.task_submissions_elapsed_guard();

create or replace function public.set_task_timer_seconds(p_submission_id bigint, p_seconds int)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_row public.task_submissions;
  v_current int;
  v_manages boolean;
begin
  if p_seconds is null or p_seconds < 0 or p_seconds > 86400 then
    raise exception 'Time must be between 0 and 24 hours.';
  end if;

  select * into v_row from public.task_submissions where id = p_submission_id for update;
  if not found then
    raise exception 'Task not found.';
  end if;

  v_current := v_row.timer_elapsed_seconds
    + coalesce(greatest(0, extract(epoch from now() - v_row.timer_started_at)::int), 0);
  v_manages := public.is_admin()
    or (public.is_manager() and exists (select 1 from public.profiles where id = v_row.user_id and lead_id = auth.uid()));

  if not v_manages then
    if v_row.user_id is distinct from auth.uid() or not public.is_active_user() then
      raise exception 'You can''t change the time on this task.';
    end if;
    if p_seconds > v_current then
      raise exception 'You can only lower your own time. Ask your lead to add time.';
    end if;
  end if;

  if v_row.timer_started_at is not null then
    -- Pause (the timer trigger banks the run), then restart from the new time.
    update public.task_submissions set timer_started_at = null where id = p_submission_id;
    update public.task_submissions set timer_elapsed_seconds = p_seconds, timer_started_at = now() where id = p_submission_id;
  else
    update public.task_submissions set timer_elapsed_seconds = p_seconds where id = p_submission_id;
  end if;
end;
$$;

revoke execute on function public.set_task_timer_seconds(bigint, int) from public, anon;
grant execute on function public.set_task_timer_seconds(bigint, int) to authenticated;

notify pgrst, 'reload schema';
