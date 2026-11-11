-- ============================================================================================
-- Unclaim: an Octet Mind contributor releasing a task from their queue, filed by themselves on the
-- TASK ISSUES form ("Other: Unclaim") from the browser extension. Recorded the same way as a
-- self-filed extension or reclaim (file_own_task_request), so it's never sent to a lead.
-- Run after 20261110_self_filed_task_issues.sql.
-- ============================================================================================

alter table public.task_requests drop constraint if exists task_requests_type_check;
alter table public.task_requests add constraint task_requests_type_check
  check (type in ('extension', 'reclaim', 'unclaim', 'bad_video'));

create or replace function public.task_requests_require_reason()
returns trigger language plpgsql set search_path = public
as $$
begin
  if new.type in ('extension', 'reclaim', 'unclaim') and trim(coalesce(new.reason, '')) = '' then
    raise exception 'Please give a reason for this request.';
  end if;
  return new;
end;
$$;

-- Same as in 20261110_self_filed_task_issues.sql, plus 'unclaim'.
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
  if p_type not in ('extension', 'reclaim', 'unclaim') then
    raise exception 'Choose an extension, a reclaim or an unclaim.';
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

notify pgrst, 'reload schema';
