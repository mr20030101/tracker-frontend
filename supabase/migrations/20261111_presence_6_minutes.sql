-- ============================================================================================
-- Fewer presence pings: the app now says "I'm here" every 3 minutes instead of every minute, so
-- someone counts as online for 6 minutes after their last ping (was 3). Same as before otherwise.
-- Matches ONLINE_THRESHOLD_MS in src/lib/presence.ts.
-- Also stops streaming task_submissions changes to Realtime: the leads' "X submitted a task" pop-up
-- was the only listener and it's gone. Run after 20261111_bill_paid_reports.sql.
-- ============================================================================================

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
  where p.is_active and public.is_active_user() and (
    public.is_manager()
    or p.is_bot
    or p.role = 'admin'
    or p.last_seen_at > now() - interval '6 minutes'
    or p.id = (select me.lead_id from public.profiles me where me.id = auth.uid())
    or exists (
      select 1 from public.messages m
      where (m.sender_id = auth.uid() and m.recipient_id = p.id)
         or (m.recipient_id = auth.uid() and m.sender_id = p.id)
    )
  )
$$;

grant execute on function public.directory() to authenticated;

do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'task_submissions'
  ) then
    alter publication supabase_realtime drop table public.task_submissions;
  end if;
end;
$$;

notify pgrst, 'reload schema';
