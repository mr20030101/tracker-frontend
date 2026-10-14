-- The public Apply form now goes through api/apply.ts (a Vercel Function), which checks the
-- visitor's country and a Cloudflare Turnstile token before calling this with the service role.
-- Closing it to anon/authenticated means a script can no longer skip those checks by calling the
-- RPC directly with the public anon key.
revoke execute on function public.submit_hiring_application(uuid, text, text, text, text, text, boolean, boolean, boolean, text, text, numeric) from public, anon, authenticated;
grant execute on function public.submit_hiring_application(uuid, text, text, text, text, text, boolean, boolean, boolean, text, text, numeric) to service_role;
