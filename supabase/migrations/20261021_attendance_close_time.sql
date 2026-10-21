-- When attendance closes is now a setting instead of a code change: an admin sets the default for
-- everyone (1:30 PM to start), and a lead can set a different time for their own team (an admin can
-- for any team). Opening stays at 6:00 AM. Run after 20261020_attendance_photo_setting.sql.

-- Minutes after midnight, Singapore time: after 6:00 AM, before midnight.
alter table public.app_settings
  add column if not exists attendance_closes_min int not null default 810
    check (attendance_closes_min between 361 and 1439);

-- A team's own closing time, keyed by its lead. No row means the team uses the default. RLS on with
-- no policies, so it goes through the functions below.
create table if not exists public.team_attendance_settings (
  lead_id uuid primary key references public.profiles(id) on delete cascade,
  closes_min int not null check (closes_min between 361 and 1439),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.team_attendance_settings enable row level security;

-- e.g. 810 -> '1:30 PM'.
create or replace function public.attendance_time_label(p_minutes int)
returns text language sql stable set search_path = public
as $$ select to_char(timestamp '2000-01-01' + make_interval(mins => p_minutes), 'FMHH12:MI AM') $$;

-- When attendance closes for one person: their team's time, or the default.
create or replace function public.attendance_closes_min_for(p_user_id uuid)
returns int language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select t.closes_min from public.team_attendance_settings t join public.profiles p on p.lead_id = t.lead_id where p.id = p_user_id),
    (select attendance_closes_min from public.app_settings where id),
    810
  )
$$;

-- Only file_attendance() and the functions below use it.
revoke execute on function public.attendance_closes_min_for(uuid) from public, anon, authenticated;

-- When the caller's own attendance closes today. The dashboard and api/attendance-photo ask this.
create or replace function public.attendance_closes_min()
returns int language sql stable security definer set search_path = public
as $$ select public.attendance_closes_min_for(auth.uid()) $$;

revoke execute on function public.attendance_closes_min() from public, anon;
grant execute on function public.attendance_closes_min() to authenticated;

-- The closing times a manager can see: the default (lead_id null), then every team's for an admin,
-- or their own team's for a lead. Nothing for anyone else.
create or replace function public.attendance_close_times()
returns table (lead_id uuid, closes_min int) language sql stable security definer set search_path = public
as $$
  select null::uuid, s.attendance_closes_min from public.app_settings s where s.id and public.is_manager()
  union all
  select t.lead_id, t.closes_min from public.team_attendance_settings t
  where public.is_admin() or (public.is_manager() and t.lead_id = auth.uid())
$$;

revoke execute on function public.attendance_close_times() from public, anon;
grant execute on function public.attendance_close_times() to authenticated;

-- Sets when attendance closes: p_lead_id null is the default (admins only); otherwise that lead's
-- team (the lead themselves, or an admin). p_closes_min null puts a team back on the default.
-- Recorded in the Activity Log.
create or replace function public.set_attendance_closes_min(p_lead_id uuid, p_closes_min int)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_team text;
begin
  if p_closes_min is not null and (p_closes_min < 361 or p_closes_min > 1439) then
    raise exception 'Pick a time after 6:00 AM and before midnight.';
  end if;

  if p_lead_id is null then
    if not public.is_admin() then
      raise exception 'Only an admin can change the default closing time.';
    end if;
    if p_closes_min is null then
      raise exception 'Pick a closing time.';
    end if;
    update public.app_settings
    set attendance_closes_min = p_closes_min, updated_by = auth.uid(), updated_at = now()
    where id;
    perform public.write_audit('setting_changed', null,
      'Set attendance to close at ' || public.attendance_time_label(p_closes_min) || ' by default',
      jsonb_build_object('setting', 'attendance_closes_min', 'value', p_closes_min));
    return;
  end if;

  if not (public.is_admin() or (public.is_manager() and p_lead_id = auth.uid())) then
    raise exception 'You can only change your own team''s closing time.';
  end if;
  select name into v_team from public.profiles where id = p_lead_id and role = 'lead';
  if v_team is null then
    raise exception 'That team was not found.';
  end if;

  if p_closes_min is null then
    delete from public.team_attendance_settings where lead_id = p_lead_id;
  else
    insert into public.team_attendance_settings (lead_id, closes_min, updated_by)
    values (p_lead_id, p_closes_min, auth.uid())
    on conflict (lead_id) do update
      set closes_min = excluded.closes_min, updated_by = excluded.updated_by, updated_at = now();
  end if;
  perform public.write_audit('setting_changed', p_lead_id,
    case when p_closes_min is null
      then 'Put ' || v_team || '''s team back on the default attendance closing time'
      else 'Set attendance to close at ' || public.attendance_time_label(p_closes_min) || ' for ' || v_team || '''s team'
    end,
    jsonb_build_object('setting', 'attendance_closes_min', 'lead_id', p_lead_id, 'value', p_closes_min));
end;
$$;

revoke execute on function public.set_attendance_closes_min(uuid, int) from public, anon;
grant execute on function public.set_attendance_closes_min(uuid, int) to authenticated;

-- ------------------------------------------------------------
-- file_attendance: same as in 20261020_attendance_photo_setting.sql, closing at the person's
-- team's time (or the default) instead of a fixed 1:30 PM.
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
  v_closes int;
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
    -- 6:00 AM until the team's closing time, Singapore time, except on the days in
    -- OPEN_ALL_DAY_DATES (src/lib/attendanceWindow.ts), which stay open all day.
    v_closes := public.attendance_closes_min_for(p_user_id);
    if sg_now::date not in (date '2026-10-17') and (sg_minutes < 6 * 60 or sg_minutes >= v_closes) then
      raise exception 'Attendance is only taken from 6:00 AM to %.', public.attendance_time_label(v_closes);
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
