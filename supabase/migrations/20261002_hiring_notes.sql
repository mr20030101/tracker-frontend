-- Hiring pipeline notes: the lead's own notes on an applicant (interview impressions, follow-ups),
-- shown on the Hiring board and in the applicant's details. Applicants never see them.

alter table public.hiring_applications add column if not exists notes text check (char_length(notes) <= 2000);

-- The table stays read-only from the client (see "leads read own applications"); notes are
-- written only through here, by an admin or the application's own lead. Blank clears them.
create or replace function public.set_hiring_application_notes(p_id bigint, p_notes text)
returns void language plpgsql security definer set search_path = public
as $$
begin
  update public.hiring_applications
  set notes = nullif(trim(coalesce(p_notes, '')), '')
  where id = p_id
    and (public.is_admin() or (public.is_manager() and lead_id = auth.uid()));

  if not found then
    raise exception 'Application not found, or not one of yours.';
  end if;
end;
$$;

grant execute on function public.set_hiring_application_notes(bigint, text) to authenticated;

-- Signed-in people only (new functions are executable by everyone by default).
revoke execute on function public.set_hiring_application_notes(bigint, text) from public, anon;
