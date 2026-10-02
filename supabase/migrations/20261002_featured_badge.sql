-- Featured badge: a contributor pins one badge they've earned, shown next to their name on their
-- profile and the Leaderboard. Badges themselves are worked out in the app from
-- contributor_achievements (src/lib/achievements.ts); the rules are repeated below only to
-- refuse pinning one that hasn't been earned.

alter table public.profiles add column if not exists featured_badge text;

-- Null clears it. Anything else must be a badge this person has actually earned.
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
      else false
    end;

    if not earned then
      raise exception 'You can only feature a badge you have earned.';
    end if;
  end if;

  update public.profiles set featured_badge = p_badge where id = auth.uid();
end;
$$;

grant execute on function public.set_featured_badge(text) to authenticated;

-- Read through a function rather than the profiles table, so a contributor can see teammates'
-- pinned badges without being given read access to the rest of their profile row.
create or replace function public.featured_badges(p_user_ids uuid[])
returns table (user_id uuid, badge text)
language sql stable security definer set search_path = public
as $$
  select p.id, p.featured_badge
  from public.profiles p
  where p.id = any(p_user_ids) and p.featured_badge is not null and public.is_active_user()
$$;

grant execute on function public.featured_badges(uuid[]) to authenticated;

-- Signed-in people only (new functions are executable by everyone by default).
revoke execute on function public.set_featured_badge(text) from public, anon;
revoke execute on function public.featured_badges(uuid[]) from public, anon;
