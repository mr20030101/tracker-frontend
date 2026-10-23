-- Bad-video reports can be sent any time again: only extension and reclaim requests wait for the
-- lead's shift. Run after 20261023_lead_shifts.sql.

-- A contributor's extension or reclaim request only goes in during their lead's shift. A bad-video
-- report can be sent any time, and leads and admins aren't held to it.
create or replace function public.task_requests_within_lead_shift()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  sg_now timestamp := now() at time zone 'Asia/Singapore';
  sg_minutes int := extract(hour from sg_now)::int * 60 + extract(minute from sg_now)::int;
  v_shift record;
begin
  select l.name, s.starts_min, s.ends_min into v_shift
  from public.profiles me
  join public.profiles l on l.id = me.lead_id
  join public.lead_shifts s on s.lead_id = l.id
  where me.id = new.requested_by and me.role = 'contributor' and new.type <> 'bad_video';

  if found and not public.in_shift(v_shift.starts_min, v_shift.ends_min, sg_minutes) then
    raise exception 'Requests can only be sent during your lead''s shift, % to %.',
      public.attendance_time_label(v_shift.starts_min), public.attendance_time_label(v_shift.ends_min);
  end if;
  return new;
end;
$$;

