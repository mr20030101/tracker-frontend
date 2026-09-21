# Supabase Auth email templates

Supabase sends the "Forgot password?" email itself, so its look is set in the
Supabase dashboard, not in the `manage-user` function. The emails the function
sends (bootcamp announcement, account created, password reset by an admin or
lead) share the same design and live in `supabase/functions/manage-user/`.

## Reset Password (`recovery.html`)

1. Supabase dashboard > Authentication > Email Templates > **Reset Password**.
2. Subject: `Reset your Grey Owls Tracker password`
3. Message body: paste the whole of `recovery.html`.
4. Save.

`{{ .Email }}`, `{{ .ConfirmationURL }}` and `{{ .SiteURL }}` are filled in by
Supabase; keep them exactly as written. The owl in the header is loaded from
`{{ .SiteURL }}/images/greyowls/icons/icon-192.png`, so Authentication > URL
Configuration > **Site URL** must be the deployed site's address.

Set Authentication > SMTP Settings to Resend (`smtp.resend.com`, port 465, user
`resend`, password = the Resend API key, sender `hello@greyowlstracker.space`),
otherwise Supabase's shared sender is used and it is rate limited to a few
emails an hour.
