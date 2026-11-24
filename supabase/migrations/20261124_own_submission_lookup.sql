-- ============================================================================================
-- The extension's Start looked up your task with task_id ILIKE, which no index can serve under
-- row-level security, so it checked the policy on every submission and timed out. This finds the
-- caller's own row through task_submissions_task_id_cb_email_key instead.
-- ============================================================================================

create or replace function public.my_submission_for_task(p_task_id text)
returns setof public.task_submissions
language sql stable security definer set search_path = public
as $$
  select s.*
  from public.task_submissions s
  where public.is_active_user()
    and lower(s.task_id) = lower(p_task_id)
    and lower(s.cb_email) = lower(public.own_email())
$$;

revoke execute on function public.my_submission_for_task(text) from public, anon;
grant execute on function public.my_submission_for_task(text) to authenticated;
