-- A contributor can fix the reason on their own extension or reclaim request while it's still
-- pending. There's no update policy for requesters (one would let them change the status too), so
-- it goes through this function, which only ever touches the reason.
create or replace function public.edit_own_task_request(p_request_id bigint, p_reason text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if trim(coalesce(p_reason, '')) = '' then
    raise exception 'Add a reason: your lead files it with Scale.';
  end if;

  update public.task_requests
  set reason = left(trim(p_reason), 500)
  where id = p_request_id
    and requested_by = auth.uid()
    and type in ('extension', 'reclaim')
    and status = 'pending';

  if not found then
    raise exception 'This request has already been reviewed, so it can''t be edited.';
  end if;
end;
$$;

grant execute on function public.edit_own_task_request(bigint, text) to authenticated;
