-- Whether contributors must take a photo to file attendance is now an admin setting (Attendance
-- page, admins only) instead of a code change. It starts off: the photo is optional.
-- Replaces the rule from 20261020_attendance_photo_required.sql; run after it.

-- ------------------------------------------------------------
-- App-wide settings: one row. RLS on with no policies, so the API can't read or change it
-- directly; it goes through the functions below.
-- ------------------------------------------------------------
create table if not exists public.app_settings (
  id boolean primary key default true check (id),
  attendance_photo_required boolean not null default false,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (id) values (true) on conflict (id) do nothing;

alter table public.app_settings enable row level security;

-- Whether a photo is required to file attendance. Any signed-in person: the form needs to know.
create or replace function public.attendance_photo_required()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce((select attendance_photo_required from public.app_settings where id), false) $$;

revoke execute on function public.attendance_photo_required() from public, anon;
grant execute on function public.attendance_photo_required() to authenticated;

-- Admins turn the requirement on or off; recorded in the Activity Log.
create or replace function public.set_attendance_photo_required(p_required boolean)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can change this.';
  end if;
  if p_required is null then
    raise exception 'Choose required or optional.';
  end if;
  update public.app_settings
  set attendance_photo_required = p_required, updated_by = auth.uid(), updated_at = now()
  where id;
  perform public.write_audit('setting_changed', null,
    case when p_required then 'Made the attendance photo required' else 'Made the attendance photo optional' end,
    jsonb_build_object('setting', 'attendance_photo_required', 'value', p_required));
end;
$$;

revoke execute on function public.set_attendance_photo_required(boolean) from public, anon;
grant execute on function public.set_attendance_photo_required(boolean) to authenticated;

-- ------------------------------------------------------------
-- file_attendance: same as in 20261020_attendance_photo_required.sql, with the photo rule
-- following the setting.
-- ------------------------------------------------------------
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
    -- A new photo must be one you just took (so an old one can't be reused). Without one, today's
    -- entry must already have a photo, but only while an admin has the photo set as required.
    if v_photo is not null then
      if not exists (
        select 1 from public.attendance_photo_uploads u
        where u.drive_file_id = v_photo and u.user_id = auth.uid() and u.created_at > now() - interval '30 minutes'
      ) then
        raise exception 'Take your attendance photo again.';
      end if;
    elsif public.attendance_photo_required() and not exists (
      select 1 from public.attendance a where a.user_id = p_user_id and a.date = p_date and a.photo_ref is not null
    ) then
      raise exception 'Take a photo with your camera to file attendance.';
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
