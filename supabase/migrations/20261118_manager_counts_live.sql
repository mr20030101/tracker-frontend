-- ============================================================================================
-- Live feed for the managers' menu counters (src/lib/managerCountsLive.ts): pending requests,
-- feedback to check and task overlap alerts refresh when a row changes, instead of each polling
-- every two minutes. Realtime only sends a change to someone whose select policy lets them see
-- the row. task_requests may already be in the publication (the lead's request alarm uses it).
-- ============================================================================================

begin;

do $$
declare
  t text;
begin
  foreach t in array array['task_requests', 'task_feedback', 'task_overlap_alerts'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

commit;
