-- Fix: the insert policies on messages, group_messages and support_tickets looked up
-- chat_image_uploads / support_screenshot_uploads as the signed-in user. Those tables have no read
-- policies (only the upload endpoints touch them), so the lookup always came back empty and every
-- message with a photo, and every ticket with a screenshot, was refused. The checks now run in
-- security definer functions, which can read the tables while still only accepting the caller's own
-- uploads.

begin;

create or replace function public.owns_chat_images(p_refs text[])
returns boolean language sql stable security definer set search_path = public
as $$
  select not exists (
    select 1 from unnest(coalesce(p_refs, '{}')) as ref
    where not exists (select 1 from public.chat_image_uploads u where u.drive_file_id = ref and u.user_id = auth.uid())
  )
$$;

create or replace function public.is_bot_profile(p_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select coalesce((select is_bot from public.profiles where id = p_id), false)
$$;

create or replace function public.owns_support_screenshots(p_refs text[])
returns boolean language sql stable security definer set search_path = public
as $$
  select not exists (
    select 1 from unnest(coalesce(p_refs, '{}')) as ref
    where not exists (select 1 from public.support_screenshot_uploads u where u.drive_file_id = ref and u.user_id = auth.uid())
  )
$$;

drop policy if exists "only own chat images" on public.messages;
create policy "only own chat images" on public.messages as restrictive for insert to authenticated
  with check (cardinality(image_refs) = 0 or (not public.is_bot_profile(recipient_id) and public.owns_chat_images(image_refs)));

drop policy if exists "only own chat images" on public.group_messages;
create policy "only own chat images" on public.group_messages as restrictive for insert to authenticated
  with check (cardinality(image_refs) = 0 or public.owns_chat_images(image_refs));

drop policy if exists "users file own support tickets" on public.support_tickets;
create policy "users file own support tickets" on public.support_tickets for insert
  with check (
    public.is_active_user()
    and user_id = auth.uid()
    and status = 'open' and status_changed_by is null and status_changed_at is null and support_activity_at is null
    -- At most 20 a day each, so a script can't flood the list.
    and (select count(*) from public.support_tickets mine where mine.user_id = auth.uid() and mine.created_at > now() - interval '1 day') < 20
    and public.owns_support_screenshots(screenshot_refs)
  );

revoke execute on function public.owns_chat_images(text[]) from public, anon;
revoke execute on function public.is_bot_profile(uuid) from public, anon;
revoke execute on function public.owns_support_screenshots(text[]) from public, anon;
grant execute on function public.owns_chat_images(text[]) to authenticated, service_role;
grant execute on function public.is_bot_profile(uuid) to authenticated, service_role;
grant execute on function public.owns_support_screenshots(text[]) to authenticated, service_role;

commit;
