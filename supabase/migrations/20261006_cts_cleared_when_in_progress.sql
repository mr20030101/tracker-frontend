-- A task only goes to CTS once it's finished, so moving it back to In Progress (from the edit
-- form, Bulk Import or anywhere else) clears its CTS mark. It then shows as Pending again and
-- comes back in the CTS Form once it's finished.

create or replace function public.clear_cts_when_in_progress()
returns trigger language plpgsql set search_path = public
as $$
begin
  if new.status = 'in_progress' then
    new.cts_submitted_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists task_submissions_clear_cts on public.task_submissions;
create trigger task_submissions_clear_cts before insert or update of status, cts_submitted_at on public.task_submissions
  for each row execute function public.clear_cts_when_in_progress();

-- Tasks already in that state.
update public.task_submissions set cts_submitted_at = null
where status = 'in_progress' and cts_submitted_at is not null;
