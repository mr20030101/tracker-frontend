-- Each attendance save is also sent to the team's "Centralize | Attendance" Google Form by the
-- Vercel Function api/attendance-google-form (src/lib/attendanceGoogleForm.ts), which records here
-- how that went. Written only by that function (service role): attendance has no update policy.

-- When the entry was last sent to the Google Form. Older than updated_at (or null) means the latest
-- save hasn't reached the form yet, and it can be sent again.
alter table public.attendance add column if not exists google_form_sent_at timestamptz;
-- Why the last send failed, for the Attendance page to show; cleared once one succeeds.
alter table public.attendance add column if not exists google_form_error text check (char_length(google_form_error) <= 500);
