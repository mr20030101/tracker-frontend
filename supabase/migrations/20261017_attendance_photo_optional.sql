-- The attendance photo is no longer required: a contributor can file without one. Same function
-- as in 20261017_attendance_close_1330.sql (closing at 1:30 PM) with only that rule changed; a photo
-- that is given is still checked to be the caller's own, recent upload.

create or replace function public.file_attendance(
  p_user_id uuid,
  p_date date,
  p_hours text,
  p_tasking_status text,
  p_task_id text,
  p_screenshot_url text,
  p_photo_ref text default null
)
returns bigint language plpgsql security definer set search_path = public
as $$
declare
  sg_now timestamp := now() at time zone 'Asia/Singapore';
  sg_minutes int := extract(hour from sg_now)::int * 60 + extract(minute from sg_now)::int;
  is_support boolean;
  v_status text := trim(coalesce(p_tasking_status, ''));
  v_task_id text := nullif(trim(coalesce(p_task_id, '')), '');
  v_screenshot text := nullif(trim(coalesce(p_screenshot_url, '')), '');
  v_photo text := nullif(trim(coalesce(p_photo_ref, '')), '');
  v_id bigint;
begin
  if not public.is_active_user() then
    raise exception 'Sign in to file attendance.';
  end if;

  is_support := p_user_id <> auth.uid();

  if is_support then
    if not (public.is_admin() or (public.is_manager() and public.is_own_or_attached(p_user_id))) then
      raise exception 'You can only file attendance for your own team.';
    end if;
    if p_date > sg_now::date then
      raise exception 'Attendance can''t be filed for a future day.';
    end if;
    -- A support entry keeps whatever photo the person took themselves.
    v_photo := null;
  else
    if p_date <> sg_now::date then
      raise exception 'You can only file attendance for today.';
    end if;
    -- 6:00 AM – 1:30 PM Singapore time, except on the days in OPEN_ALL_DAY_DATES
    -- (src/lib/attendanceWindow.ts), which stay open all day.
    if sg_now::date not in (date '2026-10-17') and (sg_minutes < 6 * 60 or sg_minutes >= 13 * 60 + 30) then
      raise exception 'Attendance is only taken from 6:00 AM to 1:30 PM.';
    end if;
    if p_hours in ('absent', 'discontinued', 'disabled') then
      raise exception 'Only your lead can file that.';
    end if;
    -- The photo is optional. One that's given must be one you just took (so an old one can't be
    -- reused); without one, the day's existing photo (if any) is kept.
    if v_photo is not null and not exists (
      select 1 from public.attendance_photo_uploads u
      where u.drive_file_id = v_photo and u.user_id = auth.uid() and u.created_at > now() - interval '30 minutes'
    ) then
      raise exception 'Take your attendance photo again.';
    end if;
  end if;

  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'That person was not found.';
  end if;

  if v_status = '' then
    raise exception 'Pick a tasking status.';
  end if;

  if v_status = 'Tasking' then
    if v_task_id is null or v_screenshot is null then
      raise exception 'Add the Task ID and a screenshot link (or N/A).';
    end if;
  else
    v_task_id := null;
    v_screenshot := null;
  end if;

  insert into public.attendance (user_id, date, hours, tasking_status, task_id, screenshot_url, photo_ref, filed_by)
  values (p_user_id, p_date, p_hours, v_status, v_task_id, v_screenshot, v_photo, auth.uid())
  on conflict (user_id, date) do update
    set hours = excluded.hours,
        tasking_status = excluded.tasking_status,
        task_id = excluded.task_id,
        screenshot_url = excluded.screenshot_url,
        photo_ref = coalesce(excluded.photo_ref, attendance.photo_ref),
        filed_by = excluded.filed_by,
        updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.file_attendance(uuid, date, text, text, text, text, text) to authenticated;

-- Signed-in people only (new functions are executable by everyone by default).
revoke execute on function public.file_attendance(uuid, date, text, text, text, text, text) from public, anon;
