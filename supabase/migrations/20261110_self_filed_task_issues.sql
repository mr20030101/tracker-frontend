-- ============================================================================================
-- Octet Mind contributors file their own extensions and reclaims on the public TASK ISSUES form,
-- inside the Tracker, without going through their lead. Once the form reports it was submitted,
-- the app records the request here, already approved and reviewed by the contributor themselves,
-- so leads see it in Requests but aren't asked to act on it (and the request alarm stays quiet:
-- it only rings for pending ones). Not held to the lead's shift: the lead isn't involved.
-- Run after 20261110_messaging_off_all.sql.
-- ============================================================================================

-- Whether a project's extensions and reclaims are filed by the contributor on TASK ISSUES. Matches
-- timeRequestFormFor() in src/lib/taskRequests.ts: the code, or without one the name.
create or replace function public.project_self_files_requests(p_project_id bigint)
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce((
    select case
      when nullif(trim(p.code), '') is not null
        then regexp_replace(lower(p.code), '[\s_-]+', '', 'g') = 'octetmind'
      else p.name ~* 'octet'
    end
    from public.projects p where p.id = p_project_id
  ), false)
$$;

revoke execute on function public.project_self_files_requests(bigint) from public, anon;
grant execute on function public.project_self_files_requests(bigint) to authenticated;

-- Records an extension or reclaim the caller filed themselves on TASK ISSUES. Their own task only,
-- on a self-filing project. A pending or denied request of the same type on the task becomes this
-- one (so a resend after a denial doesn't leave two); otherwise a new one is added.
create or replace function public.file_own_task_request(p_submission_id bigint, p_type text, p_reason text)
returns bigint language plpgsql security definer set search_path = public
as $$
declare
  v_reason text := trim(coalesce(p_reason, ''));
  v_remotasks_id text;
  v_id bigint;
begin
  if not public.is_active_user() then
    raise exception 'Sign in to file a request.';
  end if;
  if p_type not in ('extension', 'reclaim') then
    raise exception 'Choose an extension or a reclaim.';
  end if;
  if v_reason = '' then
    raise exception 'Give a reason.';
  end if;
  if char_length(v_reason) > 500 then
    raise exception 'Keep the reason under 500 characters.';
  end if;
  if not exists (
    select 1 from public.task_submissions s
    where s.id = p_submission_id and s.user_id = auth.uid() and public.project_self_files_requests(s.project_id)
  ) then
    raise exception 'You can only file your own Octet Mind tasks this way.';
  end if;

  select remotasks_id into v_remotasks_id from public.profiles where id = auth.uid();

  select id into v_id from public.task_requests
  where task_submission_id = p_submission_id and type = p_type and requested_by = auth.uid() and status in ('pending', 'denied')
  order by id desc limit 1;

  -- Tells the lead-shift check this one is exempt (see task_requests_within_lead_shift).
  perform set_config('app.self_filed_request', 'on', true);

  if v_id is not null then
    update public.task_requests
    set status = 'approved', reason = v_reason, remotasks_id = v_remotasks_id, reviewed_by = auth.uid(), reviewed_at = now()
    where id = v_id;
  else
    insert into public.task_requests (type, task_submission_id, requested_by, reason, remotasks_id, status, reviewed_by, reviewed_at)
    values (p_type, p_submission_id, auth.uid(), v_reason, v_remotasks_id, 'approved', auth.uid(), now())
    returning id into v_id;
  end if;

  perform set_config('app.self_filed_request', 'off', true);
  return v_id;
end;
$$;

revoke execute on function public.file_own_task_request(bigint, text, text) from public, anon;
grant execute on function public.file_own_task_request(bigint, text, text) to authenticated;

-- Same as in 20261023_lead_shifts.sql, except a self-filed request (file_own_task_request) skips it.
create or replace function public.task_requests_within_lead_shift()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  sg_now timestamp := now() at time zone 'Asia/Singapore';
  sg_minutes int := extract(hour from sg_now)::int * 60 + extract(minute from sg_now)::int;
  v_shift record;
begin
  if current_setting('app.self_filed_request', true) = 'on' then
    return new;
  end if;

  select l.name, s.starts_min, s.ends_min into v_shift
  from public.profiles me
  join public.profiles l on l.id = me.lead_id
  join public.lead_shifts s on s.lead_id = l.id
  where me.id = new.requested_by and me.role = 'contributor';

  if found and not public.in_shift(v_shift.starts_min, v_shift.ends_min, sg_minutes) then
    raise exception 'Requests can only be sent during your lead''s shift, % to %.',
      public.attendance_time_label(v_shift.starts_min), public.attendance_time_label(v_shift.ends_min);
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';
