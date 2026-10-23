-- ============================================================================================
-- Rewards count task levels. Tasks are attempted (Attempter), then reviewed at L0 and L1, and the
-- reviews are harder, so a reward now says how many points a submitted task at each level is
-- worth (up to two decimal places). A level worth 0 doesn't count. Rankings and thresholds go by points; every_week_on_target
-- still counts tasks (weekly targets are in tasks), only at the levels that count.
--
-- Existing rewards get 1 point for every level, which is how they counted before.
-- ============================================================================================
alter table public.rewards
  add column if not exists points_attempt numeric(5, 2) not null default 1 check (points_attempt between 0 and 100),
  add column if not exists points_l0 numeric(5, 2) not null default 1 check (points_l0 between 0 and 100),
  add column if not exists points_l1 numeric(5, 2) not null default 1 check (points_l1 between 0 and 100);

-- Points can be fractional (e.g. 1.5 for an L1 task). An earlier copy of this migration made them
-- whole numbers; this widens those in place.
alter table public.rewards
  alter column points_attempt type numeric(5, 2),
  alter column points_l0 type numeric(5, 2),
  alter column points_l1 type numeric(5, 2);

alter table public.rewards drop constraint if exists rewards_some_level_counts;
alter table public.rewards add constraint rewards_some_level_counts check (points_attempt + points_l0 + points_l1 > 0);

-- The return type changes (per-level counts and points), so it has to be dropped first.
drop function if exists public.reward_standings(bigint);
create function public.reward_standings(p_reward_id bigint)
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
      coalesce((select t.target from public.weekly_targets t where t.user_id = pe.id and t.week_start = w.ws), 50) as target
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

-- The signature grows the three point values, so the old one goes (and the whole-number one from
-- an earlier copy of this migration).
drop function if exists public.create_reward(text, text, uuid, text, integer, integer, bigint, numeric[], text, text, date, date, boolean);
drop function if exists public.create_reward(text, text, uuid, text, integer, integer, bigint, numeric[], text, text, date, date, boolean, integer, integer, integer);
create function public.create_reward(
  p_title text,
  p_description text,
  p_team_lead_id uuid,
  p_rule text,
  p_threshold integer,
  p_places integer,
  p_project_id bigint,
  p_prize_amounts numeric[],
  p_currency text,
  p_prize_note text,
  p_starts_on date,
  p_ends_on date,
  p_announce boolean default true,
  p_points_attempt numeric default 1,
  p_points_l0 numeric default 1,
  p_points_l1 numeric default 1
)
returns bigint language plpgsql security definer set search_path = public
as $$
declare
  new_id bigint;
  v_team uuid := p_team_lead_id;
  v_places integer := case when p_rule = 'top_submitters' then coalesce(p_places, 1) else 1 end;
begin
  -- A lead's reward is always for their own team; only an admin picks another team or everyone.
  if not public.is_admin() then
    if not public.is_manager() then
      raise exception 'Only leads and admins can create rewards.';
    end if;
    v_team := auth.uid();
  end if;
  if p_starts_on < public.sg_today() then
    raise exception 'A reward can''t start in the past.';
  end if;
  if p_rule = 'top_submitters' and cardinality(p_prize_amounts) < v_places then
    raise exception 'Give a prize for each of the % places.', v_places;
  end if;
  if coalesce(p_points_attempt, 0) + coalesce(p_points_l0, 0) + coalesce(p_points_l1, 0) <= 0 then
    raise exception 'Pick at least one level (Attempter, L0 or L1) to count.';
  end if;

  insert into public.rewards (
    created_by, team_lead_id, title, description, rule, threshold, places, project_id,
    prize_amounts, currency, prize_note, starts_on, ends_on, points_attempt, points_l0, points_l1
  ) values (
    auth.uid(), v_team, trim(p_title), nullif(trim(coalesce(p_description, '')), ''), p_rule,
    case when p_rule in ('top_submitters', 'min_tasks') then p_threshold end, v_places, p_project_id,
    case when p_rule = 'top_submitters' then p_prize_amounts[1:v_places] else p_prize_amounts end,
    upper(coalesce(nullif(trim(p_currency), ''), 'PHP')), nullif(trim(coalesce(p_prize_note, '')), ''),
    p_starts_on, p_ends_on, round(coalesce(p_points_attempt, 0), 2), round(coalesce(p_points_l0, 0), 2), round(coalesce(p_points_l1, 0), 2)
  ) returning id into new_id;

  if p_announce then
    insert into public.announcements (author_id, audience, team_lead_id, title, body)
    values (
      auth.uid(),
      case when v_team is null then 'everyone' else 'team' end,
      v_team,
      left('New reward: ' || trim(p_title), 120),
      left(concat_ws(E'\n\n', nullif(trim(coalesce(p_description, '')), ''),
        format('Runs %s to %s. See the Rewards page for the rules and how you''re doing.',
          to_char(p_starts_on, 'FMMon FMDD'), to_char(p_ends_on, 'FMMon FMDD, YYYY'))), 4000)
    );
  end if;

  perform public.write_audit('reward_created', null, format('Created the reward "%s"', trim(p_title)), jsonb_build_object('reward_id', new_id));
  return new_id;
end;
$$;

-- Signed-in people only (new functions are executable by everyone by default).
revoke execute on function public.reward_standings(bigint) from public, anon;
grant execute on function public.reward_standings(bigint) to authenticated, service_role;
revoke execute on function public.create_reward(text, text, uuid, text, integer, integer, bigint, numeric[], text, text, date, date, boolean, numeric, numeric, numeric) from public, anon;
grant execute on function public.create_reward(text, text, uuid, text, integer, integer, bigint, numeric[], text, text, date, date, boolean, numeric, numeric, numeric) to authenticated, service_role;
