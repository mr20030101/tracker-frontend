-- ============================================================================================
-- Hours a day per project: how many hours a contributor is expected to render on it each day,
-- set on the Projects page. Replaces the task-count Daily Quota once targets move to hours.
-- Blank (null) means not set. Run after 20261111_no_timer_limit.sql.
-- ============================================================================================

alter table public.projects add column if not exists daily_hours numeric(4, 2)
  check (daily_hours is null or (daily_hours > 0 and daily_hours <= 24));

notify pgrst, 'reload schema';
