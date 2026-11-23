-- ============================================================================================
-- Free-entry audits, for the RST team: an audit no longer comes from a logged task. The lead types the task ID and
-- the name of the person audited (who may have no Tracker account), and picks one of their own
-- projects. Audits made before this keep their task submission and CB.
--
-- Who sees and changes an audit: admins, everyone's; a lead whose team is RST, the ones on their
-- projects, the ones they saved, and (older audits) the ones of their own CBs. A Bootcamp lead
-- sees none. A lead can only file an audit on one of their projects. Run after 20261029_task_audits.sql.
-- ============================================================================================

begin;

alter table public.task_audits add column if not exists cb_name text;

-- Older audits: the CB's name, from their profile.
update public.task_audits a set cb_name = p.name
from public.profiles p
where p.id = a.cb_user_id and a.cb_name is null;
update public.task_audits set cb_name = 'Unknown' where cb_name is null or trim(cb_name) = '';

alter table public.task_audits alter column cb_name set not null;
alter table public.task_audits alter column task_submission_id drop not null;
alter table public.task_audits alter column cb_user_id drop not null;

alter table public.task_audits drop constraint if exists task_audits_cb_name_length;
alter table public.task_audits add constraint task_audits_cb_name_length check (char_length(cb_name) between 1 and 200);
alter table public.task_audits drop constraint if exists task_audits_task_id_length;
alter table public.task_audits add constraint task_audits_task_id_length check (char_length(task_id) between 1 and 200);

create index if not exists task_audits_project_idx on public.task_audits(project_id);

-- Whether the caller leads an RST team (Settings → Team → Program, 20261109_team_program.sql).
create or replace function public.is_rst_lead()
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_manager() and exists (
    select 1 from public.team_features f where f.lead_id = auth.uid() and f.program = 'rst'
  )
$$;

revoke execute on function public.is_rst_lead() from public, anon;
grant execute on function public.is_rst_lead() to authenticated;

-- An RST lead's audits: on their projects, saved by them, or (older ones) of their attached CBs.
create or replace function public.can_see_task_audit(p_cb_user_id uuid, p_project_id bigint, p_audited_by uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_admin()
    or (
      public.is_rst_lead() and (
        p_audited_by = auth.uid()
        or (p_project_id is not null and public.is_project_lead(p_project_id))
        or (p_cb_user_id is not null and public.can_audit_task(p_cb_user_id))
      )
    )
$$;

revoke execute on function public.can_see_task_audit(uuid, bigint, uuid) from public, anon;
grant execute on function public.can_see_task_audit(uuid, bigint, uuid) to authenticated;

-- Filing or saving one: an RST lead on a project they run (an admin on any), signed as themselves.
create or replace function public.can_file_task_audit(p_project_id bigint)
returns boolean language sql stable security definer set search_path = public
as $$
  select p_project_id is not null
    and (public.is_admin() or (public.is_rst_lead() and public.is_project_lead(p_project_id)))
$$;

revoke execute on function public.can_file_task_audit(bigint) from public, anon;
grant execute on function public.can_file_task_audit(bigint) to authenticated;

drop policy if exists "managers read task audits" on public.task_audits;
create policy "managers read task audits" on public.task_audits for select
  using (public.can_see_task_audit(cb_user_id, project_id, audited_by));

drop policy if exists "managers add task audits" on public.task_audits;
create policy "managers add task audits" on public.task_audits for insert
  with check (public.can_file_task_audit(project_id) and audited_by = auth.uid());

drop policy if exists "managers edit task audits" on public.task_audits;
create policy "managers edit task audits" on public.task_audits for update
  using (public.can_see_task_audit(cb_user_id, project_id, audited_by))
  with check (public.can_file_task_audit(project_id) and audited_by = auth.uid());

drop policy if exists "managers delete task audits" on public.task_audits;
create policy "managers delete task audits" on public.task_audits for delete
  using (public.can_see_task_audit(cb_user_id, project_id, audited_by));

-- New audits are free entries: no submission, no linked CB (the client can't set one). Saving an
-- older audit turns it into a free entry too, keeping its CB so their lead still sees it. Names and
-- task IDs are trimmed, and updated_at uses the server's time.
create or replace function public.task_audits_fill()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.task_submission_id := null;
    new.cb_user_id := null;
  else
    new.task_submission_id := null;
    new.cb_user_id := old.cb_user_id;
  end if;

  new.cb_name := trim(coalesce(new.cb_name, ''));
  new.task_id := trim(coalesce(new.task_id, ''));
  if new.cb_name = '' then
    raise exception 'Enter the name of the person audited.';
  end if;
  if new.task_id = '' then
    raise exception 'Enter the task ID.';
  end if;
  if new.project_id is null then
    raise exception 'Pick a project.';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists task_audits_fill on public.task_audits;
create trigger task_audits_fill before insert or update on public.task_audits
  for each row execute function public.task_audits_fill();

commit;

notify pgrst, 'reload schema';
