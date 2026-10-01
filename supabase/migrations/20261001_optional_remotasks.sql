-- The application form's Remotasks email and ID are now optional: someone without a Remotasks
-- account yet can still apply. Their login, once accepted, uses the active email instead
-- (manage-user/create-account.ts). Duplicate checks key on the Remotasks email when given,
-- otherwise the active email.

alter table public.hiring_applications alter column remotasks_email drop not null;
alter table public.hiring_applications alter column remotasks_id drop not null;

-- One live application per applicant per lead; a denied applicant may re-apply.
drop index if exists public.hiring_applications_open_key;
create unique index if not exists hiring_applications_open_key
  on public.hiring_applications(lead_id, lower(coalesce(remotasks_email, active_email))) where status in ('pending', 'accepted');

create or replace function public.submit_hiring_application(
  p_lead_id uuid,
  p_remotasks_email text,
  p_remotasks_id text,
  p_full_name text,
  p_active_email text,
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
  v_accepting boolean;
  v_remotasks_email text := lower(trim(coalesce(p_remotasks_email, '')));
  v_active_email text := lower(trim(coalesce(p_active_email, '')));
  v_remotasks_id text := trim(coalesce(p_remotasks_id, ''));
  v_full_name text := trim(coalesce(p_full_name, ''));
  v_facebook_url text := trim(coalesce(p_facebook_url, ''));
  v_cpu text := trim(coalesce(p_cpu, ''));
  v_gpu text := trim(coalesce(p_gpu, ''));
  -- What identifies the applicant for the one-live-application rule.
  v_identity text;
begin
  select accepting_applications into v_accepting
  from public.profiles where id = p_lead_id and role = 'lead' and is_active;

  if v_accepting is null then
    raise exception 'This application link is not valid.';
  end if;

  if not v_accepting then
    raise exception 'This lead is not accepting applications right now.';
  end if;

  -- The Remotasks email and ID are optional; everything else is required.
  if v_full_name = '' or v_active_email = '' or v_facebook_url = ''
    or p_has_robotics_background is null or p_has_personal_computer is null or p_has_stable_internet is null then
    raise exception 'Please answer every question.';
  end if;

  if v_active_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    or (v_remotasks_email <> '' and v_remotasks_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'Please enter a valid email address.';
  end if;

  if v_facebook_url !~* '^https?://\S+$' then
    raise exception 'Please enter your Facebook profile link.';
  end if;

  if p_gpu_memory_gb is not null and (p_gpu_memory_gb < 0 or p_gpu_memory_gb > 256) then
    raise exception 'Please enter your GPU memory in GB (0 if you have no dedicated GPU).';
  end if;

  if char_length(v_remotasks_email) > 254 or char_length(v_active_email) > 254 or char_length(v_remotasks_id) > 200
    or char_length(v_full_name) > 200 or char_length(v_facebook_url) > 500 or char_length(v_cpu) > 200 or char_length(v_gpu) > 200 then
    raise exception 'One of your answers is too long.';
  end if;

  v_identity := coalesce(nullif(v_remotasks_email, ''), v_active_email);

  if exists (
    select 1 from public.hiring_applications
    where lead_id = p_lead_id and lower(coalesce(remotasks_email, active_email)) = v_identity and status in ('pending', 'accepted')
  ) then
    raise exception 'An application with this email has already been submitted.';
  end if;

  insert into public.hiring_applications
    (lead_id, remotasks_email, remotasks_id, full_name, active_email, facebook_url, has_robotics_background,
     has_personal_computer, has_stable_internet, cpu, gpu, gpu_memory_gb)
  values
    (p_lead_id, nullif(v_remotasks_email, ''), nullif(v_remotasks_id, ''), v_full_name, v_active_email, v_facebook_url,
     p_has_robotics_background, p_has_personal_computer, p_has_stable_internet, nullif(v_cpu, ''), nullif(v_gpu, ''), p_gpu_memory_gb);
exception
  -- Two submissions racing past the check above hit the unique index instead.
  when unique_violation then
    raise exception 'An application with this email has already been submitted.';
end;
$$;

grant execute on function public.submit_hiring_application(uuid, text, text, text, text, text, boolean, boolean, boolean, text, text, numeric) to anon, authenticated;
