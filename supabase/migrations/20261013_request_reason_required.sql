-- Extension and reclaim requests now need a reason: the lead files it with Scale. Checked on insert
-- only, so older requests sent without one can still be approved, denied or deleted.
create or replace function public.task_requests_require_reason()
returns trigger language plpgsql set search_path = public
as $$
begin
  if new.type in ('extension', 'reclaim') and trim(coalesce(new.reason, '')) = '' then
    raise exception 'Please give a reason for this request.';
  end if;
  return new;
end;
$$;

drop trigger if exists task_requests_require_reason on public.task_requests;
create trigger task_requests_require_reason before insert on public.task_requests
  for each row execute function public.task_requests_require_reason();
