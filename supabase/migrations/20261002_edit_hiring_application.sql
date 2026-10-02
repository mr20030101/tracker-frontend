-- Editing an applicant's details: applicants mistype their email, Remotasks ID or Facebook link,
-- and the lead needs to correct it (most of all before creating their account, whose login is the
-- Remotasks email, or the active email when there is none).
--
-- The table stays read-only from the client; this is the one way in, for an admin or the
-- application's own lead. It applies the same checks the public form does
-- (submit_hiring_application), and records what changed in the audit log.

create or replace function public.update_hiring_application(
  p_id bigint,
  p_full_name text,
  p_active_email text,
  p_remotasks_email text,
  p_remotasks_id text,
  p_facebook_url text,
  p_has_robotics_background boolean,
  p_has_personal_computer boolean,
  p_has_stable_internet boolean,
  p_cpu text,
  p_gpu text,
  p_gpu_memory_gb numeric
)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_old public.hiring_applications;
  v_full_name text := trim(coalesce(p_full_name, ''));
  v_active_email text := lower(trim(coalesce(p_active_email, '')));
  v_remotasks_email text := lower(trim(coalesce(p_remotasks_email, '')));
  v_remotasks_id text := trim(coalesce(p_remotasks_id, ''));
  v_facebook_url text := trim(coalesce(p_facebook_url, ''));
  v_cpu text := trim(coalesce(p_cpu, ''));
  v_gpu text := trim(coalesce(p_gpu, ''));
  v_changes jsonb := '{}'::jsonb;
begin
  select * into v_old from public.hiring_applications
  where id = p_id and (public.is_admin() or (public.is_manager() and lead_id = auth.uid()));

  if not found then
    raise exception 'Application not found, or not one of yours.';
  end if;

  if v_full_name = '' or v_active_email = '' or v_facebook_url = '' or p_has_robotics_background is null then
    raise exception 'Name, active email, Facebook link and the robotics question are required.';
  end if;

  if v_active_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    or (v_remotasks_email <> '' and v_remotasks_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'Please enter a valid email address.';
  end if;

  if v_facebook_url !~* '^https?://\S+$' then
    raise exception 'Please enter a Facebook profile link starting with https://.';
  end if;

  if p_gpu_memory_gb is not null and (p_gpu_memory_gb < 0 or p_gpu_memory_gb > 256) then
    raise exception 'GPU memory must be between 0 and 256 GB.';
  end if;

  if char_length(v_remotasks_email) > 254 or char_length(v_active_email) > 254 or char_length(v_remotasks_id) > 200
    or char_length(v_full_name) > 200 or char_length(v_facebook_url) > 500 or char_length(v_cpu) > 200 or char_length(v_gpu) > 200 then
    raise exception 'One of the answers is too long.';
  end if;

  update public.hiring_applications set
    full_name = v_full_name,
    active_email = v_active_email,
    remotasks_email = nullif(v_remotasks_email, ''),
    remotasks_id = nullif(v_remotasks_id, ''),
    facebook_url = v_facebook_url,
    has_robotics_background = p_has_robotics_background,
    has_personal_computer = p_has_personal_computer,
    has_stable_internet = p_has_stable_internet,
    cpu = nullif(v_cpu, ''),
    gpu = nullif(v_gpu, ''),
    gpu_memory_gb = p_gpu_memory_gb
  where id = p_id;

  -- Only the fields that actually changed, old and new, so the log says what was corrected.
  select coalesce(jsonb_object_agg(n.key, jsonb_build_object('from', o.value, 'to', n.value)), '{}'::jsonb)
  into v_changes
  from jsonb_each(to_jsonb(v_old)) o
  join jsonb_each((select to_jsonb(h) from public.hiring_applications h where h.id = p_id)) n using (key)
  where o.value is distinct from n.value;

  if v_changes <> '{}'::jsonb then
    perform public.write_audit(
      'application_edited',
      v_old.user_id,
      'Edited the application of ' || v_full_name || ' (' || array_to_string(array(select jsonb_object_keys(v_changes)), ', ') || ')',
      v_changes
    );
  end if;
exception
  -- The same person can only have one live application per lead (hiring_applications_open_key).
  when unique_violation then
    raise exception 'Another live application to this lead already uses that email.';
end;
$$;

grant execute on function public.update_hiring_application(bigint, text, text, text, text, text, boolean, boolean, boolean, text, text, numeric) to authenticated;

-- Signed-in people only (new functions are executable by everyone by default).
revoke execute on function public.update_hiring_application(bigint, text, text, text, text, text, boolean, boolean, boolean, text, text, numeric) from public, anon;

-- Make the new function callable straight away instead of after the API's next schema refresh.
notify pgrst, 'reload schema';
