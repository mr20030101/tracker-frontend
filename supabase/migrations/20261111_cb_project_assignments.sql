-- ============================================================================================
-- Contributors are assigned projects, from the ones their lead runs. A row in
-- contributor_project_levels (which also holds their level there) now means "assigned": leads and
-- admins tick and untick them on the Contributors page. Before this every contributor counted as
-- on all of their lead's projects, so each gets a row for each of those it didn't have yet, at the
-- default level, and nobody loses a project. The existing policies already let a lead add and
-- remove these rows for their own contributors on their own projects. Run after
-- 20261111_l10_stage.sql.
-- ============================================================================================

insert into public.contributor_project_levels (user_id, project_id, level)
select p.id, pl.project_id, 'contributor'
from public.profiles p
join public.project_leads pl on pl.lead_id = p.lead_id
where p.role = 'contributor'
on conflict (user_id, project_id) do nothing;
