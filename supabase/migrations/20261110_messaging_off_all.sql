-- ============================================================================================
-- Messaging off for every team, as announced: the app has outgrown it. New leads' teams start
-- with it off too. An admin can still turn it back on for a team in Settings → Team.
-- Run after 20261110_team_messaging.sql.
-- ============================================================================================

alter table public.team_features alter column messaging_enabled set default false;

insert into public.team_features (lead_id, messaging_enabled)
select id, false from public.profiles where role = 'lead'
on conflict (lead_id) do update set messaging_enabled = false, updated_at = now();

-- Teams with no row yet count as on (team_features_for and messaging_enabled_for fall back to
-- true), so new leads also need a row: the coalesce fallbacks now read false.
create or replace function public.messaging_enabled_for(p_user_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select case
    when (select role from public.profiles where id = p_user_id) not in ('lead', 'contributor') then true
    else coalesce((
      select f.messaging_enabled
      from public.profiles p
      join public.team_features f
        on f.lead_id = case when p.role = 'lead' then p.id when p.role = 'contributor' then p.lead_id end
      where p.id = p_user_id
    ), false)
  end
$$;

-- Same for what the app reads: a lead or contributor without a row has messaging off; an admin on.
create or replace function public.team_features_for(p_user_id uuid)
returns table (cts_enabled boolean, attendance_enabled boolean, attendance_public boolean, cts_trainer text, backup_form_enabled boolean, program text,
  messaging_enabled boolean)
language sql stable security definer set search_path = public
as $$
  select coalesce(f.cts_enabled, true), coalesce(f.attendance_enabled, true), coalesce(f.attendance_public, false), f.cts_trainer,
    coalesce(f.backup_form_enabled, false), coalesce(f.program, 'bootcamp'),
    coalesce(f.messaging_enabled, coalesce(p.role not in ('lead', 'contributor'), true))
  from (select 1) one
  left join public.profiles p on p.id = p_user_id and public.is_active_user()
  left join public.team_features f
    on f.lead_id = case when p.role = 'lead' then p.id when p.role = 'contributor' then p.lead_id end
$$;

notify pgrst, 'reload schema';

-- Check: every lead's team should show false.
select p.name, f.messaging_enabled
from public.profiles p left join public.team_features f on f.lead_id = p.id
where p.role = 'lead' order by p.name;
