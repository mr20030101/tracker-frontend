-- ============================================================================================
-- Billing for leads: a lead sees their own share of each month's Supabase bill and whether it's
-- marked paid. Only their own rows, through this function: not the other leads' shares, the admin's
-- notes on a payment, or the invoice PDF (it has the account holder's address).
-- Run after 20261111_lead_billing.sql.
-- ============================================================================================

create or replace function public.my_billing()
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare
  v_role text;
begin
  select role into v_role from public.profiles where id = auth.uid() and is_active and not must_change_password;
  if v_role is distinct from 'lead' then
    return jsonb_build_object('exempt', false, 'bills', '[]'::jsonb);
  end if;

  return jsonb_build_object(
    'exempt', exists (select 1 from public.billing_exempt_leads where lead_id = auth.uid()),
    'bills', coalesce((
      select jsonb_agg(jsonb_build_object(
        'month', b.month,
        'amount', b.amount,
        'currency', m.currency,
        'paid_at', b.paid_at,
        'supabase_amount', m.supabase_amount,
        'leads', (select count(*) from public.lead_bills o where o.month = b.month)
      ) order by b.month desc)
      from public.lead_bills b
      join public.billing_months m on m.month = b.month
      where b.lead_id = auth.uid()
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.my_billing() from public, anon;
grant execute on function public.my_billing() to authenticated;

notify pgrst, 'reload schema';
