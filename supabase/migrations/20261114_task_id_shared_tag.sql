-- ============================================================================================
-- Task IDs logged by more than one CB: each such submission is tagged in the app (the
-- logged_by_other_cb field), and admins now get the cross-team notification as well as the two
-- leads. Run after 20261114_task_id_per_person.sql.
-- ============================================================================================

begin;

-- Read as a field of task_submissions (select=*,logged_by_other_cb). Security definer so it can
-- see the other team's rows; it only says whether another CB has the same task ID.
create or replace function public.logged_by_other_cb(s public.task_submissions)
returns boolean language sql stable security definer set search_path = public
as $$
  select s.task_id is not null and exists (
    select 1 from public.task_submissions o
    where lower(o.task_id) = lower(s.task_id) and lower(o.cb_email) <> lower(s.cb_email)
  )
$$;
revoke execute on function public.logged_by_other_cb(public.task_submissions) from public, anon;
grant execute on function public.logged_by_other_cb(public.task_submissions) to authenticated;

-- Alerts now go to admins too, so the recipient is no longer always a lead.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'task_overlap_alerts' and column_name = 'lead_id') then
    alter table public.task_overlap_alerts rename column lead_id to recipient_id;
  end if;
end $$;

drop policy if exists "leads read own overlap alerts" on public.task_overlap_alerts;
drop policy if exists "leads mark own overlap alerts read" on public.task_overlap_alerts;
drop policy if exists "recipients read own overlap alerts" on public.task_overlap_alerts;
create policy "recipients read own overlap alerts" on public.task_overlap_alerts for select
  using (recipient_id = auth.uid() and public.is_active_user());
drop policy if exists "recipients mark own overlap alerts read" on public.task_overlap_alerts;
create policy "recipients mark own overlap alerts read" on public.task_overlap_alerts for update
  using (recipient_id = auth.uid() and public.is_active_user())
  with check (recipient_id = auth.uid());

create or replace function public.task_overlap_notify()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_team uuid;
  v_name text;
  v_team_name text;
  o record;
  o_team uuid;
  o_name text;
  o_team_name text;
begin
  if new.task_id is null or trim(new.task_id) = '' then
    return new;
  end if;
  if tg_op = 'UPDATE' and lower(new.task_id) is not distinct from lower(old.task_id)
     and lower(new.cb_email) = lower(old.cb_email) then
    return new;
  end if;

  v_team := public.submission_team_lead(new.cb_email, new.user_id);
  select coalesce(nullif(trim(name), ''), new.cb_email) into v_name from public.profiles where lower(email) = lower(new.cb_email) limit 1;
  select name into v_team_name from public.profiles where id = v_team;

  for o in
    select s.id, s.cb_email, s.user_id from public.task_submissions s
    where lower(s.task_id) = lower(new.task_id) and s.id <> new.id and lower(s.cb_email) <> lower(new.cb_email)
  loop
    o_team := public.submission_team_lead(o.cb_email, o.user_id);
    if o_team is not distinct from v_team then
      continue;
    end if;
    select coalesce(nullif(trim(name), ''), o.cb_email) into o_name from public.profiles where lower(email) = lower(o.cb_email) limit 1;
    select name into o_team_name from public.profiles where id = o_team;

    insert into public.task_overlap_alerts (recipient_id, task_id, submission_id, other_submission_id, logged_by, logged_by_team, other_by, other_team)
    select r, new.task_id, new.id, o.id, coalesce(v_name, new.cb_email), v_team_name, coalesce(o_name, o.cb_email), o_team_name
    from (
      select unnest(array[v_team, o_team]) as r
      union
      select id from public.profiles where role = 'admin' and is_active and not is_bot
    ) recipients
    where r is not null
    on conflict do nothing;
  end loop;

  return new;
end;
$$;
revoke execute on function public.task_overlap_notify() from public, anon, authenticated;

commit;

notify pgrst, 'reload schema';
