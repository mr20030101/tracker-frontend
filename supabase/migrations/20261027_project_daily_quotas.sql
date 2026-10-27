-- ============================================================================================
-- Daily quotas by CB project level. Each project sets a daily quota for contributor, L0, L1 and
-- L10, and a contributor's weekly target comes from the quotas on their projects (times five
-- working days) instead of being set by hand. Profiles, streaks, team history and rewards now
-- read the target from weekly_target_of(). Run after 20261024_task_timers.sql.
-- ============================================================================================
alter table public.projects
  add column if not exists daily_quota_contributor integer check (daily_quota_contributor >= 0),
  add column if not exists daily_quota_l0 integer check (daily_quota_l0 >= 0),
  add column if not exists daily_quota_l1 integer check (daily_quota_l1 >= 0),
  add column if not exists daily_quota_l10 integer check (daily_quota_l10 >= 0);

-- Every contributor in p_user_ids (all of them when null), unchecked: only for the security
-- definer functions here, which decide who sees what themselves.
create or replace function public.daily_quotas_unchecked(p_user_ids uuid[])
returns table (user_id uuid, project_id bigint, level text, daily_quota integer)
language sql stable security definer set search_path = public
as $$
  select x.user_id, x.project_id, x.level, x.daily_quota from (
    select p.id as user_id, pr.id as project_id, coalesce(cpl.level, 'contributor') as level,
      case coalesce(cpl.level, 'contributor')
        when 'contributor' then pr.daily_quota_contributor
        when 'l0' then pr.daily_quota_l0
        when 'l1' then pr.daily_quota_l1
        when 'l10' then pr.daily_quota_l10
      end as daily_quota
    from public.profiles p
    join public.project_leads pl on pl.lead_id = p.lead_id
    join public.projects pr on pr.id = pl.project_id
    left join public.contributor_project_levels cpl on cpl.user_id = p.id and cpl.project_id = pr.id
    where p.role = 'contributor' and (p_user_ids is null or p.id = any(p_user_ids))
  ) x
  where x.daily_quota is not null
$$;
revoke execute on function public.daily_quotas_unchecked(uuid[]) from public, anon, authenticated;

create or replace function public.weekly_target_of(p_user_id uuid, p_week_start date)
returns integer language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select sum(q.daily_quota)::integer * 5 from public.daily_quotas_unchecked(array[p_user_id]) q),
    (select wt.target from public.weekly_targets wt where wt.user_id = p_user_id and wt.week_start = p_week_start),
    125
  )
$$;
revoke execute on function public.weekly_target_of(uuid, date) from public, anon, authenticated;

-- Whether the caller may see this person's quotas and target: themselves, a lead's attached
-- contributors, anyone for an admin, and everyone for the server (the digest edge functions).
create or replace function public.can_see_target(p_user_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce(auth.jwt() ->> 'role', '') = 'service_role' or public.is_admin() or public.is_own_or_attached(p_user_id)
$$;
revoke execute on function public.can_see_target(uuid) from public, anon, authenticated;

-- The daily quota on each project, for these people (or everyone the caller may see when null).
create or replace function public.project_daily_quotas(p_user_ids uuid[] default null)
returns table (user_id uuid, project_id bigint, level text, daily_quota integer)
language sql stable security definer set search_path = public
as $$
  select q.* from public.daily_quotas_unchecked(p_user_ids) q where public.can_see_target(q.user_id)
$$;
revoke execute on function public.project_daily_quotas(uuid[]) from public, anon;
grant execute on function public.project_daily_quotas(uuid[]) to authenticated, service_role;

-- The weekly target for the week starting p_week_start (a Tuesday), for these contributors (or
-- every one the caller may see when null).
create or replace function public.weekly_targets_for(p_week_start date, p_user_ids uuid[] default null)
returns table (user_id uuid, target integer)
language sql stable security definer set search_path = public
as $$
  select p.id, public.weekly_target_of(p.id, p_week_start)
  from public.profiles p
  where p.role = 'contributor' and (p_user_ids is null or p.id = any(p_user_ids)) and public.can_see_target(p.id)
$$;
revoke execute on function public.weekly_targets_for(date, uuid[]) from public, anon;
grant execute on function public.weekly_targets_for(date, uuid[]) to authenticated, service_role;

-- The same functions as before, reading the target from weekly_target_of().
create or replace function public.contributor_public_stats(p_target_email text, p_week_start date)
returns table (
  id uuid,
  name text,
  avatar_url text,
  role text,
  lead_id uuid,
  is_active boolean,
  shift text,
  bio text,
  weekly_target integer,
  submitted_this_week bigint,
  stage_breakdown jsonb,
  project_breakdown jsonb,
  trend jsonb,
  levels jsonb
)
language sql stable security definer set search_path = public
as $$
  with target as (
    select * from public.profiles p
    where lower(p.email) = lower(p_target_email) and not p.is_bot and public.is_active_user()
  ),
  target_submissions as (
    select s.* from public.task_submissions s, target t
    where lower(s.cb_email) = lower(t.email) or s.user_id = t.id
  ),
  stage_agg as (
    select coalesce(jsonb_object_agg(stage, cnt), '{}'::jsonb) as j
    from (select stage, count(*) as cnt from target_submissions group by stage) x
  ),
  project_agg as (
    select coalesce(jsonb_agg(jsonb_build_object('name', pname, 'total', cnt) order by cnt desc), '[]'::jsonb) as j
    from (
      select coalesce(p.name, 'Unassigned') as pname, count(*) as cnt
      from target_submissions ts
      left join public.projects p on p.id = ts.project_id
      group by coalesce(p.name, 'Unassigned')
    ) x
  ),
  trend_days as (
    select gs::date as d from generate_series(current_date - interval '29 days', current_date, interval '1 day') gs
  ),
  trend_agg as (
    select coalesce(
      jsonb_agg(jsonb_build_object('date', to_char(td.d, 'YYYY-MM-DD'), 'value', coalesce(c.cnt, 0)) order by td.d),
      '[]'::jsonb
    ) as j
    from trend_days td
    left join (
      select date as d, count(*) as cnt from target_submissions where status = 'submitted' group by date
    ) c on c.d = td.d
  ),
  levels_agg as (
    select coalesce(
      jsonb_agg(jsonb_build_object('project_id', cpl.project_id, 'level', cpl.level)),
      '[]'::jsonb
    ) as j
    from public.contributor_project_levels cpl, target t
    where cpl.user_id = t.id
  )
  select
    t.id,
    t.name,
    t.avatar_url,
    t.role,
    t.lead_id,
    t.is_active,
    t.shift,
    t.bio,
    public.weekly_target_of(t.id, p_week_start) as weekly_target,
    (
      select count(*) from target_submissions ts
      where ts.status = 'submitted' and ts.date >= p_week_start and ts.date <= (p_week_start + 6)
    ) as submitted_this_week,
    (select j from stage_agg) as stage_breakdown,
    (select j from project_agg) as project_breakdown,
    (select j from trend_agg) as trend,
    (select j from levels_agg) as levels
  from target t
$$;

create or replace function public.contributor_achievements(p_user_ids uuid[])
returns table (
  user_id uuid, current_streak integer, best_streak integer, weeks_hit integer, total_submitted bigint, best_week bigint,
  personal_bests integer, spooky_seasons integer, october_weeks_hit integer, october_weeks integer
)
language sql stable security definer set search_path = public
as $$
  with cw as (
    select d - ((extract(isodow from d)::int + 5) % 7) as ws
    from (select (now() at time zone 'Asia/Singapore')::date as d) t
  ),
  people as (
    select p.id, p.email from public.profiles p
    where p.id = any(p_user_ids) and p.role = 'contributor' and public.is_active_user()
  ),
  weekly as (
    select pe.id as user_id, (s.date - ((extract(isodow from s.date)::int + 5) % 7)) as week_start, count(*) as n
    from people pe
    join public.task_submissions s
      on s.status = 'submitted' and s.date is not null
     and (s.user_id = pe.id or lower(s.cb_email) = lower(pe.email))
    group by 1, 2
  ),
  weeks as (
    select f.user_id, gs::date as week_start
    from (select w.user_id, min(w.week_start) as first_week from weekly w group by w.user_id) f
    cross join lateral generate_series(f.first_week::timestamp, (select ws from cw)::timestamp, interval '7 days') gs
  ),
  flags as (
    select w.user_id, w.week_start, coalesce(wk.n, 0) as n,
      coalesce(wk.n, 0) > 0 and coalesce(wk.n, 0) >= public.weekly_target_of(w.user_id, w.week_start) as hit,
      w.week_start = (select ws from cw) as is_current
    from weeks w
    left join weekly wk on wk.user_id = w.user_id and wk.week_start = w.week_start
  ),
  counted as (
    select * from flags where not is_current or hit
  ),
  islands as (
    select user_id, week_start, hit,
      row_number() over (partition by user_id order by week_start)
        - row_number() over (partition by user_id, hit order by week_start) as grp
    from counted
  ),
  runs as (
    select user_id, count(*)::integer as len, max(week_start) as last_week
    from islands where hit group by user_id, grp
  ),
  bests as (
    select user_id, n,
      max(n) over (partition by user_id order by week_start rows between unbounded preceding and 1 preceding) as prev_best,
      count(*) over (partition by user_id order by week_start rows between unbounded preceding and 1 preceding) as prev_weeks
    from flags
  ),
  octobers as (
    select f.user_id, extract(year from f.week_start)::int as y, count(*) filter (where f.hit)::integer as hits
    from flags f
    where extract(month from f.week_start) = 10
    group by 1, 2
  ),
  october_sizes as (
    select ys.y, (
      select count(*) from generate_series(make_date(ys.y, 10, 1), make_date(ys.y, 10, 31), interval '1 day') d
      where extract(isodow from d) = 2
    )::integer as total
    from (select o.y from octobers o union select extract(year from (select ws from cw))::int) ys
  )
  select pe.id,
    coalesce((select r.len from runs r where r.user_id = pe.id and r.last_week >= (select ws from cw) - 7 order by r.last_week desc limit 1), 0),
    coalesce((select max(r.len) from runs r where r.user_id = pe.id), 0),
    (select count(*) from flags f where f.user_id = pe.id and f.hit)::integer,
    coalesce((select sum(w.n) from weekly w where w.user_id = pe.id), 0)::bigint,
    coalesce((select max(w.n) from weekly w where w.user_id = pe.id), 0)::bigint,
    (select count(*) from bests b where b.user_id = pe.id and b.prev_weeks >= 4 and b.n > b.prev_best)::integer,
    (select count(*) from octobers o join october_sizes z on z.y = o.y where o.user_id = pe.id and o.hits >= z.total)::integer,
    coalesce((select o.hits from octobers o where o.user_id = pe.id and o.y = extract(year from (select ws from cw))::int), 0),
    (select z.total from october_sizes z where z.y = extract(year from (select ws from cw))::int)
  from people pe
$$;

create or replace function public.team_weekly_history(p_weeks integer)
returns table (user_id uuid, name text, avatar_url text, cb_email text, week_start date, submitted integer, target integer)
language sql stable security definer set search_path = public
as $$
  with cw as (
    select d - ((extract(isodow from d)::int + 5) % 7) as ws
    from (select (now() at time zone 'Asia/Singapore')::date as d) t
  ),
  weeks as (
    select (select ws from cw) - 7 * g as week_start
    from generate_series(0, least(greatest(p_weeks, 1), 26) - 1) g
  ),
  team as (
    select p.id, p.name, p.avatar_url, p.email from public.profiles p
    where p.role = 'contributor' and p.is_active and public.is_active_user()
      and p.lead_id is not distinct from (select lead_id from public.profiles where id = auth.uid())
  )
  select t.id, t.name, t.avatar_url, case when public.is_manager() then t.email end, w.week_start,
    (
      select count(*) from public.task_submissions s
      where s.status = 'submitted' and s.date >= w.week_start and s.date < w.week_start + 7
        and (s.user_id = t.id or lower(s.cb_email) = lower(t.email))
    )::integer,
    public.weekly_target_of(t.id, w.week_start)
  from team t cross join weeks w
  order by w.week_start desc, t.name
$$;

create or replace function public.reward_standings(p_reward_id bigint)
returns table (
  user_id uuid, name text, avatar_url text, cb_email text,
  submitted integer, attempt_tasks integer, l0_tasks integer, l1_tasks integer, points numeric,
  weeks_hit integer, weeks_total integer, reached_at timestamptz, place integer, qualifies boolean
)
language plpgsql stable security definer set search_path = public
as $$
declare
  r public.rewards;
  first_week date;
begin
  select * into r from public.rewards where id = p_reward_id;
  if r.id is null or not public.can_view_reward(r.team_lead_id) then
    return;
  end if;
  -- The first Tuesday on or after the start: weeks counted for every_week_on_target.
  first_week := r.starts_on + ((2 - extract(isodow from r.starts_on)::int + 7) % 7);

  return query
  with people as (
    select p.id, p.name, p.avatar_url, p.email from public.profiles p
    where p.role = 'contributor' and p.is_active and (r.team_lead_id is null or p.lead_id = r.team_lead_id)
  ),
  scored as (
    select pe.id as uid, s.date, s.created_at, s.stage,
      case s.stage when 'attempt' then r.points_attempt when 'l0' then r.points_l0 when 'l1' then r.points_l1 else 0 end as pts
    from people pe
    join public.task_submissions s
      on s.status = 'submitted' and s.date between r.starts_on and r.ends_on
     and (r.project_id is null or s.project_id = r.project_id)
     and (s.user_id = pe.id or lower(s.cb_email) = lower(pe.email))
  ),
  subs as (
    select * from scored x where x.pts > 0
  ),
  totals as (
    select x.uid, count(*)::integer as n,
      count(*) filter (where x.stage = 'attempt')::integer as n_attempt,
      count(*) filter (where x.stage = 'l0')::integer as n_l0,
      count(*) filter (where x.stage = 'l1')::integer as n_l1,
      sum(x.pts) as pts,
      max(x.created_at) as reached
    from subs x group by x.uid
  ),
  weeks as (
    select gs::date as ws from generate_series(first_week::timestamp, (r.ends_on - 6)::timestamp, interval '7 days') gs
  ),
  weekly as (
    select pe.id as uid, w.ws,
      (select count(*) from subs x where x.uid = pe.id and x.date >= w.ws and x.date < w.ws + 7) as n,
      public.weekly_target_of(pe.id, w.ws) as target
    from people pe cross join weeks w
  ),
  hits as (
    select wk.uid, count(*) filter (where wk.n > 0 and wk.n >= wk.target)::integer as hit from weekly wk group by wk.uid
  ),
  ranked as (
    select pe.id, pe.name, pe.avatar_url, pe.email,
      coalesce(t.n, 0) as n, coalesce(t.n_attempt, 0) as n_attempt, coalesce(t.n_l0, 0) as n_l0, coalesce(t.n_l1, 0) as n_l1,
      coalesce(t.pts, 0) as pts, t.reached,
      coalesce(h.hit, 0) as hit,
      (select count(*) from weeks)::integer as total,
      row_number() over (order by coalesce(t.pts, 0) desc, t.reached asc nulls last, pe.name)::integer as rn
    from people pe
    left join totals t on t.uid = pe.id
    left join hits h on h.uid = pe.id
  )
  select k.id, k.name, k.avatar_url, case when public.is_manager() then k.email end,
    k.n, k.n_attempt, k.n_l0, k.n_l1, k.pts, k.hit, k.total, k.reached,
    case when r.rule = 'top_submitters' then k.rn end,
    case r.rule
      when 'top_submitters' then k.pts >= greatest(coalesce(r.threshold, 1), 1) and k.rn <= r.places
      when 'min_tasks' then k.pts >= r.threshold
      when 'every_week_on_target' then k.total > 0 and k.hit = k.total
      else false
    end
  from ranked k
  order by k.rn;
end;
$$;
