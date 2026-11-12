-- ============================================================================================
-- Signed-in devices, for admins only: each sign-in's device, IP and last activity, flagged when an
-- account is active from 2+ places at once or from a new device, with a way to sign one out.
-- Nothing is blocked; this is for spotting shared accounts. Run after 20261113_edit_task_timer.sql.
-- ============================================================================================

-- One row per sign-in (auth session), kept after it signs out so a "new device" can be told apart.
-- No policies: read and written only through the functions below.
create table if not exists public.session_activity (
  session_id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  device text not null,
  ip text,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
create index if not exists session_activity_user_idx on public.session_activity (user_id, first_seen);
alter table public.session_activity enable row level security;
revoke all on public.session_activity from anon, authenticated;

create or replace function public.request_ip()
returns text language sql stable set search_path = public
as $$
  select nullif(trim(coalesce(
    current_setting('request.headers', true)::json->>'cf-connecting-ip',
    split_part(current_setting('request.headers', true)::json->>'x-forwarded-for', ',', 1)
  )), '')
$$;
revoke execute on function public.request_ip() from public, anon, authenticated;

-- The presence ping now also records which sign-in it came from, and returns false once that
-- sign-in has been signed out (by an admin), so the page can sign itself out without waiting for
-- the access token to run out.
drop function if exists public.touch_presence();
create or replace function public.touch_presence(p_device text default null)
returns boolean language plpgsql security definer set search_path = public
as $$
declare
  v_session uuid := nullif(auth.jwt()->>'session_id', '')::uuid;
begin
  if auth.uid() is null then
    return false;
  end if;
  if v_session is not null and not exists (select 1 from auth.sessions where id = v_session and user_id = auth.uid()) then
    return false;
  end if;
  update public.profiles set last_seen_at = now() where id = auth.uid();
  if v_session is not null then
    insert into public.session_activity (session_id, user_id, device, ip)
    values (v_session, auth.uid(), left(coalesce(nullif(trim(p_device), ''), 'Unknown device'), 80), public.request_ip())
    on conflict (session_id) do update
      set last_seen = now(),
          ip = coalesce(excluded.ip, session_activity.ip),
          device = case when p_device is null then session_activity.device else excluded.device end
      where session_activity.user_id = auth.uid();
  end if;
  return true;
end;
$$;
revoke execute on function public.touch_presence(text) from public, anon;
grant execute on function public.touch_presence(text) to authenticated;

-- A person's current sign-ins. via_link marks one made from an emailed link or an admin's
-- "Log in as" rather than a password; is_new_device marks a device first seen in the last 7 days
-- on an account that was already used from another one.
create or replace function public.list_user_sessions(p_user_id uuid)
returns table (
  session_id uuid, device text, user_agent text, sign_in_ip text, last_ip text,
  signed_in_at timestamptz, last_active timestamptz, via_link boolean, is_new_device boolean
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can see signed-in devices.';
  end if;
  return query
  select
    s.id,
    sa.device,
    s.user_agent::text,
    host(s.ip),
    sa.ip,
    s.created_at,
    coalesce(sa.last_seen, s.updated_at, s.created_at),
    exists (
      select 1 from auth.mfa_amr_claims c
      where c.session_id = s.id and c.authentication_method in ('otp', 'magiclink', 'recovery', 'invite', 'email/signup', 'email_change')
    ),
    sa.device is not null and sa.device <> 'Browser extension'
      and (select min(x.first_seen) from public.session_activity x where x.user_id = p_user_id and x.device = sa.device) > now() - interval '7 days'
      and exists (
        select 1 from public.session_activity y
        where y.user_id = p_user_id and y.device not in (sa.device, 'Browser extension') and y.first_seen < now() - interval '7 days'
      )
  from auth.sessions s
  left join public.session_activity sa on sa.session_id = s.id
  where s.user_id = p_user_id
  order by coalesce(sa.last_seen, s.updated_at, s.created_at) desc;
end;
$$;
revoke execute on function public.list_user_sessions(uuid) from public, anon;
grant execute on function public.list_user_sessions(uuid) to authenticated;

-- Accounts worth a look, for the Users list: active from 2+ places (device + IP) in the last
-- 6 minutes, leaving out the extension and link sign-ins, or on a new device this week.
create or replace function public.session_flags()
returns table (user_id uuid, active_places int, new_device boolean)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can see signed-in devices.';
  end if;
  return query
  with live as (
    select sa.user_id, sa.device, sa.ip, sa.last_seen,
      (select min(x.first_seen) from public.session_activity x where x.user_id = sa.user_id and x.device = sa.device) as device_first_seen
    from public.session_activity sa
    join auth.sessions s on s.id = sa.session_id
    where not exists (
      select 1 from auth.mfa_amr_claims c
      where c.session_id = s.id and c.authentication_method in ('otp', 'magiclink', 'recovery', 'invite', 'email/signup', 'email_change')
    )
  ),
  per_user as (
    select l.user_id,
      count(distinct (l.device, coalesce(l.ip, ''))) filter (where l.last_seen > now() - interval '6 minutes' and l.device <> 'Browser extension')::int as places,
      bool_or(l.device <> 'Browser extension' and l.device_first_seen > now() - interval '7 days' and exists (
        select 1 from public.session_activity y
        where y.user_id = l.user_id and y.device not in (l.device, 'Browser extension') and y.first_seen < now() - interval '7 days'
      )) as fresh
    from live l
    group by l.user_id
  )
  select p.user_id, p.places, p.fresh from per_user p where p.places >= 2 or p.fresh;
end;
$$;
revoke execute on function public.session_flags() from public, anon;
grant execute on function public.session_flags() to authenticated;

-- Signs one sign-in out. Its page notices on its next presence ping (or when its token next
-- refreshes) and goes to the sign-in screen.
create or replace function public.revoke_user_session(p_session_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can sign out a device.';
  end if;
  delete from auth.sessions where id = p_session_id;
  if not found then
    raise exception 'That device is already signed out.';
  end if;
end;
$$;
revoke execute on function public.revoke_user_session(uuid) from public, anon;
grant execute on function public.revoke_user_session(uuid) to authenticated;

notify pgrst, 'reload schema';
