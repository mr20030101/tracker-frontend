-- ============================================================================================
-- A resource can be limited to one lead's team. Until now a project's resources were seen by all
-- of its leads and every contributor of each of them, so when two leads shared a project, both
-- teams saw everything. resources.lead_id, when set, narrows that to one team: the lead, their
-- contributors (if the lead still leads the project), their program's team manager, and admins.
-- Empty keeps the old behaviour (everyone on the project, or everyone for a general resource).
--
-- A lead can only limit a resource to their own team; a team manager to any team in their
-- program that leads the project; an admin to any lead of the project. Another lead on the same
-- project can neither see nor change it.
--
-- Uploaded files for such a resource go in <project id>/<lead id>/, and the storage policies
-- apply the same rule to that folder. Files in <project id>/ are unchanged.
-- Run after 20261127_rst_task_fields.sql.
-- ============================================================================================

begin;

-- On delete cascade: setting it to null when a lead is removed would hand their team's resources
-- to the whole project.
alter table public.resources
  add column if not exists lead_id uuid references public.profiles(id) on delete cascade;

create index if not exists resources_lead_id_idx on public.resources (lead_id) where lead_id is not null;

-- The team must be one that works on the project. Not checked when the project is gone (the
-- project_id foreign key sets it to null): the resource then stays visible to that team's
-- lead, team manager and admins only, never to everyone.
create or replace function public.resources_check_lead()
returns trigger language plpgsql set search_path = public
as $$
begin
  if new.lead_id is null then
    return new;
  end if;
  if new.project_id is null then
    if tg_op = 'INSERT' or old.project_id is null then
      raise exception 'A resource limited to one team needs a project';
    end if;
    return new;
  end if;
  if not exists (select 1 from public.project_leads where project_id = new.project_id and lead_id = new.lead_id) then
    raise exception 'That lead does not lead this project';
  end if;
  return new;
end;
$$;

drop trigger if exists resources_check_lead on public.resources;
create trigger resources_check_lead before insert or update of project_id, lead_id on public.resources
  for each row execute function public.resources_check_lead();

-- -------------------------------------------------------------------------------------------
-- Rows
-- -------------------------------------------------------------------------------------------

drop policy if exists "users read permitted resources" on public.resources;
create policy "users read permitted resources" on public.resources for select to authenticated
  using (
    public.is_admin()
    or (project_id is null and lead_id is null and public.is_active_user())
    or (lead_id is null and (
      public.is_project_lead(project_id)
      or exists (
        select 1 from public.profiles p
        join public.project_leads pl on pl.lead_id = p.lead_id
        where p.id = auth.uid() and pl.project_id = resources.project_id
      )
    ))
    or (lead_id is not null and (
      public.manages_team(lead_id)
      or exists (
        select 1 from public.profiles p
        join public.project_leads pl on pl.lead_id = p.lead_id
        where p.id = auth.uid() and p.lead_id = resources.lead_id and pl.project_id = resources.project_id
      )
    ))
  );

drop policy if exists "admins or project leads manage resources" on public.resources;
create policy "admins or project leads manage resources" on public.resources for all
  using (
    public.is_admin()
    or (project_id is not null and public.is_project_lead(project_id) and (lead_id is null or public.manages_team(lead_id)))
  )
  with check (
    public.is_admin()
    or (project_id is not null and public.is_project_lead(project_id) and (lead_id is null or public.manages_team(lead_id)))
  );

-- -------------------------------------------------------------------------------------------
-- Files: <project id>/<file> as before, or <project id>/<lead id>/<file> for one team's.
-- -------------------------------------------------------------------------------------------

create or replace function public.can_read_resource_file(object_name text)
returns boolean language sql stable security definer set search_path = public
as $$
  select case
    when (storage.foldername(object_name))[1] is null then public.is_active_user()
    when (storage.foldername(object_name))[1] = 'general' then public.is_active_user()
    when (storage.foldername(object_name))[1] ~ '^\d+$' then
      public.can_view_project(((storage.foldername(object_name))[1])::bigint)
      and case
        when (storage.foldername(object_name))[2] is null then true
        when (storage.foldername(object_name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
          public.is_admin()
          or public.manages_team(((storage.foldername(object_name))[2])::uuid)
          or exists (
            select 1 from public.profiles
            where id = auth.uid() and lead_id = ((storage.foldername(object_name))[2])::uuid
          )
        else public.is_admin()
      end
    else public.is_admin()
  end
$$;

create or replace function public.can_write_resource_file(object_name text)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_admin() or (
    (storage.foldername(object_name))[1] ~ '^\d+$'
    and public.is_project_lead(((storage.foldername(object_name))[1])::bigint)
    and public.is_manager()
    and case
      when (storage.foldername(object_name))[2] is null then true
      when (storage.foldername(object_name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        public.manages_team(((storage.foldername(object_name))[2])::uuid)
      else false
    end
  )
$$;

commit;

notify pgrst, 'reload schema';
