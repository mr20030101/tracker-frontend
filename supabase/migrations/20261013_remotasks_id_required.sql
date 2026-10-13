-- Every user must have a valid Remotasks ID on file (a 24-character hex id, e.g.
-- 60e818c8f76af4001e9901d6): the app blocks with a modal until they save one. Extension and
-- reclaim requests now also record the ID the contributor gave, which is what the lead files
-- with Scale.
--
-- Existing profiles.remotasks_id values aren't constrained here, so a mistyped one already on
-- file doesn't break unrelated profile updates; the app treats it as missing and asks again.

-- Sets just the caller's own Remotasks ID, from the blocking modal and the request form.
create or replace function public.set_own_remotasks_id(new_remotasks_id text)
returns public.profiles
language plpgsql security definer set search_path = public
as $$
declare
  v_id text := lower(trim(coalesce(new_remotasks_id, '')));
  updated public.profiles;
begin
  if v_id !~ '^[0-9a-f]{24}$' then
    raise exception 'A Remotask ID is 24 characters: the digits 0-9 and the letters a-f.';
  end if;

  update public.profiles
  set remotasks_id = v_id, updated_at = now()
  where id = auth.uid()
  returning * into updated;

  return updated;
end;
$$;

grant execute on function public.set_own_remotasks_id(text) to authenticated;

-- Edit Profile: the same format check whenever a Remotasks ID is given.
create or replace function public.update_own_profile(
  new_name text,
  new_avatar_url text,
  new_remotasks_id text default null,
  new_shift text default null,
  new_bio text default null
)
returns public.profiles
language plpgsql security definer set search_path = public
as $$
declare
  v_remotasks_id text := lower(trim(coalesce(new_remotasks_id, '')));
  updated public.profiles;
begin
  if new_name is null or trim(new_name) = '' then
    raise exception 'Name is required.';
  end if;

  if v_remotasks_id <> '' and v_remotasks_id !~ '^[0-9a-f]{24}$' then
    raise exception 'A Remotask ID is 24 characters: the digits 0-9 and the letters a-f.';
  end if;

  update public.profiles
  set name = trim(new_name),
      avatar_url = new_avatar_url,
      remotasks_id = nullif(v_remotasks_id, ''),
      shift = nullif(trim(coalesce(new_shift, '')), ''),
      bio = nullif(trim(coalesce(new_bio, '')), ''),
      updated_at = now()
  where id = auth.uid()
  returning * into updated;

  return updated;
end;
$$;

-- The Remotasks ID given on an extension or reclaim request. Null on requests from before it was
-- asked for (the app falls back to the requester's profile for those).
alter table public.task_requests add column if not exists remotasks_id text
  check (remotasks_id ~ '^[0-9a-f]{24}$');
