-- Profile views: opening a teammate's profile counts as a view, so the team can see whose profile
-- is visited most. One view per viewer per profile per day (Singapore time), so refreshing or
-- coming back later the same day doesn't inflate it, and your own profile never counts.
-- Only counts are exposed; who viewed whom stays private (no read policy on the table).

create table if not exists public.profile_views (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  view_date date not null default (now() at time zone 'Asia/Singapore')::date,
  viewed_at timestamptz not null default now(),
  primary key (profile_id, viewer_id, view_date),
  check (profile_id <> viewer_id)
);

create index if not exists profile_views_date_idx on public.profile_views(view_date);

-- No policies: the table is only reached through the functions below.
alter table public.profile_views enable row level security;

create or replace function public.record_profile_view(p_profile_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_active_user() or p_profile_id = auth.uid() then
    return;
  end if;
  insert into public.profile_views (profile_id, viewer_id)
  select p_profile_id, auth.uid()
  where exists (select 1 from public.profiles where id = p_profile_id)
  on conflict do nothing;
end;
$$;

-- One profile's totals, for the figure on the profile page.
create or replace function public.profile_view_count(p_profile_id uuid)
returns table (views bigint, viewers bigint)
language sql stable security definer set search_path = public
as $$
  select count(*)::bigint, count(distinct viewer_id)::bigint
  from public.profile_views
  where profile_id = p_profile_id and public.is_active_user()
$$;

-- The "most famous" ranking: active contributors by views since p_since (all time when null).
create or replace function public.most_viewed_profiles(p_since date default null, p_limit int default 10)
returns table (user_id uuid, name text, avatar_url text, views bigint, viewers bigint)
language sql stable security definer set search_path = public
as $$
  select p.id, p.name, p.avatar_url, count(*)::bigint, count(distinct v.viewer_id)::bigint
  from public.profile_views v
  join public.profiles p on p.id = v.profile_id
  where public.is_active_user()
    and p.is_active and p.role = 'contributor'
    and (p_since is null or v.view_date >= p_since)
  group by p.id, p.name, p.avatar_url
  order by count(*) desc, count(distinct v.viewer_id) desc, p.name
  limit least(greatest(coalesce(p_limit, 10), 1), 50)
$$;

-- Signed-in only (see the grant block at the end of schema.sql).
revoke execute on function public.record_profile_view(uuid) from public, anon;
revoke execute on function public.profile_view_count(uuid) from public, anon;
revoke execute on function public.most_viewed_profiles(date, int) from public, anon;
grant execute on function public.record_profile_view(uuid) to authenticated, service_role;
grant execute on function public.profile_view_count(uuid) to authenticated, service_role;
grant execute on function public.most_viewed_profiles(date, int) to authenticated, service_role;
