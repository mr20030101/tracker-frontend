-- Motivation: the dashboard's rank card, team goal and weekly recap, the Leaderboard's "Most
-- improved" tab, and two new badges (Personal Best, Spooky Season).

-- ============================================================================================
-- The caller's team, week by week: each active contributor sharing the caller's lead (the same
-- people the Leaderboard ranks), with what they submitted and their target for each of the last
-- p_weeks business weeks (Tuesday to Monday, Asia/Singapore), this week included. Capped at 26.
-- ============================================================================================
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
  select t.id, t.name, t.avatar_url, t.email, w.week_start,
    (
      select count(*) from public.task_submissions s
      where s.status = 'submitted' and s.date >= w.week_start and s.date < w.week_start + 7
        and (s.user_id = t.id or lower(s.cb_email) = lower(t.email))
    )::integer,
    coalesce((select wt.target from public.weekly_targets wt where wt.user_id = t.id and wt.week_start = w.week_start), 50)
  from team t cross join weeks w
  order by w.week_start desc, t.name
$$;

-- ============================================================================================
-- Streaks & badges, plus what the two new badges need (so changing the return type: drop first).
--   personal_bests: weeks that beat every earlier week, once there are at least 4 earlier weeks.
--   spooky_seasons: Octobers in which every week (by its Tuesday start) was hit.
--   october_weeks_hit / october_weeks: this year's October so far, for the Spooky Season progress.
-- ============================================================================================
drop function if exists public.contributor_achievements(uuid[]);

create function public.contributor_achievements(p_user_ids uuid[])
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
      coalesce(wk.n, 0) > 0 and coalesce(wk.n, 0) >= coalesce(t.target, 50) as hit,
      w.week_start = (select ws from cw) as is_current
    from weeks w
    left join weekly wk on wk.user_id = w.user_id and wk.week_start = w.week_start
    left join public.weekly_targets t on t.user_id = w.user_id and t.week_start = w.week_start
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

-- Pinning: the same rules as before, plus the two new badges.
create or replace function public.set_featured_badge(p_badge text)
returns void language plpgsql security definer set search_path = public
as $$
declare
  a record;
  earned boolean;
begin
  if not public.is_active_user() then
    raise exception 'Not allowed.';
  end if;

  if p_badge is not null then
    select * into a from public.contributor_achievements(array[auth.uid()]);

    earned := case p_badge
      when 'first-task' then coalesce(a.total_submitted, 0) >= 1
      when 'target-hit' then coalesce(a.weeks_hit, 0) >= 1
      when 'streak-3' then coalesce(a.best_streak, 0) >= 3
      when 'streak-10' then coalesce(a.best_streak, 0) >= 10
      when 'club-100' then coalesce(a.total_submitted, 0) >= 100
      when 'club-500' then coalesce(a.total_submitted, 0) >= 500
      when 'club-1000' then coalesce(a.total_submitted, 0) >= 1000
      when 'big-week' then coalesce(a.best_week, 0) >= 100
      when 'personal-best' then coalesce(a.personal_bests, 0) >= 1
      when 'spooky-season' then coalesce(a.spooky_seasons, 0) >= 1
      else false
    end;

    if not earned then
      raise exception 'You can only feature a badge you have earned.';
    end if;
  end if;

  update public.profiles set featured_badge = p_badge where id = auth.uid();
end;
$$;

-- Signed-in people only (new functions are executable by everyone by default).
revoke execute on function public.team_weekly_history(integer) from public, anon;
grant execute on function public.team_weekly_history(integer) to authenticated, service_role;
revoke execute on function public.contributor_achievements(uuid[]) from public, anon;
grant execute on function public.contributor_achievements(uuid[]) to authenticated, service_role;
