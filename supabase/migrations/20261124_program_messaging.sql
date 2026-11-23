-- ============================================================================================
-- Bootcamp and RST don't message or call each other. Someone's program is their team's (a
-- contributor's lead's, or a lead's own) or, for a team manager, the one an admin gave them.
-- Admins, Meera and people with no program yet (a contributor without a lead) reach everyone.
--
-- directory() lists only the people you can reach, which is what the Messages page, the online
-- list and calls are built from, and a message to someone in the other program is refused. Calls
-- ring over a Realtime broadcast the database can't see, so the app turns away a call from
-- anyone not in your directory (src/lib/call.tsx). Run after 20261123_team_managers.sql.
-- ============================================================================================

begin;

create or replace function public.program_of_person(p_user_id uuid)
returns text language sql stable security definer set search_path = public
as $$
  select case when p.role = 'team_manager' then p.program else public.team_program_of(p.id) end
  from public.profiles p
  where p.id = p_user_id
$$;

-- Whether the caller may message or call this person.
create or replace function public.can_reach(p_user_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_admin()
    or p_user_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = p_user_id and (p.role = 'admin' or p.is_bot))
    or public.program_of_person(auth.uid()) is null
    or public.program_of_person(p_user_id) is null
    or public.program_of_person(auth.uid()) = public.program_of_person(p_user_id)
$$;

revoke execute on function public.program_of_person(uuid) from public, anon;
grant execute on function public.program_of_person(uuid) to authenticated;
revoke execute on function public.can_reach(uuid) from public, anon;
grant execute on function public.can_reach(uuid) to authenticated;

drop policy if exists "only within your program" on public.messages;
create policy "only within your program" on public.messages as restrictive for insert to authenticated
  with check (public.can_reach(recipient_id));

-- From 20261123_team_managers.sql, plus can_reach().
create or replace function public.directory()
returns table (id uuid, name text, is_active boolean, last_seen_at timestamptz, avatar_url text, role text, is_bot boolean, email text, lead_id uuid)
language sql stable security definer set search_path = public
as $$
  select p.id, p.name, p.is_active,
    case when public.is_manager() or p.last_seen_at > now() - interval '6 minutes' then p.last_seen_at end,
    p.avatar_url, p.role, p.is_bot,
    case when public.is_manager() then p.email end,
    case when public.is_manager() then p.lead_id end
  from public.profiles p
  where p.is_active and public.is_active_user() and public.can_reach(p.id) and (
    public.is_manager()
    or p.is_bot
    or p.role in ('admin', 'team_manager')
    or p.last_seen_at > now() - interval '6 minutes'
    or p.id = (select me.lead_id from public.profiles me where me.id = auth.uid())
    or exists (
      select 1 from public.messages m
      where (m.sender_id = auth.uid() and m.recipient_id = p.id)
         or (m.recipient_id = auth.uid() and m.sender_id = p.id)
    )
  )
$$;

commit;

notify pgrst, 'reload schema';
