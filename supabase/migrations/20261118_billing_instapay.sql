-- ============================================================================================
-- InstaPay QR on the Billing page: a lead can pay by scanning the admin's GoTyme InstaPay QR
-- (pesos) instead of PayPal (USD). "I've paid" now records which one, so the admin knows where
-- to check the reference. Run after 20261111_bill_paid_reports.sql.
-- ============================================================================================

alter table public.lead_bills add column if not exists reported_method text
  check (reported_method in ('paypal', 'instapay'));
update public.lead_bills set reported_method = 'paypal' where reported_ref is not null and reported_method is null;

drop function if exists public.report_bill_paid(date, text);

create or replace function public.report_bill_paid(p_month date, p_ref text, p_method text default 'paypal')
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_ref text := upper(regexp_replace(coalesce(p_ref, ''), '\s', '', 'g'));
  v_method text := lower(coalesce(p_method, 'paypal'));
  v_paid timestamptz;
  v_found boolean;
begin
  if not exists (
    select 1 from public.profiles where id = auth.uid() and role = 'lead' and is_active and not must_change_password
  ) then
    raise exception 'Only a lead can report a payment.';
  end if;
  if v_method not in ('paypal', 'instapay') then
    raise exception 'Choose PayPal or InstaPay.';
  end if;
  if v_ref !~ '^[A-Z0-9-]{6,40}$' then
    raise exception '%', case v_method
      when 'instapay' then 'Enter the InstaPay reference number from your bank app (letters and numbers).'
      else 'Enter the transaction ID from PayPal (letters and numbers, e.g. 5TY05013RG002845M).'
    end;
  end if;
  select true, paid_at into v_found, v_paid from public.lead_bills where month = p_month and lead_id = auth.uid();
  if v_found is null then
    raise exception 'You aren''t billed for that month.';
  end if;
  if v_paid is not null then
    raise exception 'That month is already marked paid.';
  end if;

  update public.lead_bills set reported_paid_at = now(), reported_ref = v_ref, reported_method = v_method
  where month = p_month and lead_id = auth.uid();

  perform public.write_audit('bill_reported_paid', auth.uid(),
    (select name from public.profiles where id = auth.uid()) || ' reported paying their '
      || public.billing_month_label(p_month) || ' bill ('
      || case v_method when 'instapay' then 'InstaPay ' else 'PayPal ' end || v_ref || ')',
    jsonb_build_object('month', p_month, 'lead_id', auth.uid(), 'ref', v_ref, 'method', v_method));
end;
$$;

revoke execute on function public.report_bill_paid(date, text, text) from public, anon;
grant execute on function public.report_bill_paid(date, text, text) to authenticated;

-- my_billing() now also returns how each bill was reported paid.
create or replace function public.my_billing()
returns jsonb language plpgsql stable security definer set search_path = public
as $$
declare
  v_role text;
  v_exempt boolean;
  v_settings public.billing_settings;
begin
  select role into v_role from public.profiles where id = auth.uid() and is_active and not must_change_password;
  if v_role is distinct from 'lead' then
    return jsonb_build_object('exempt', false, 'bills', '[]'::jsonb, 'how_to_pay', null, 'paypal_me', null);
  end if;
  v_exempt := exists (select 1 from public.billing_exempt_leads where lead_id = auth.uid());
  select * into v_settings from public.billing_settings where id;
  if v_exempt and not exists (select 1 from public.lead_bills where lead_id = auth.uid() and paid_at is null) then
    v_settings := null;
  end if;

  return jsonb_build_object(
    'exempt', v_exempt,
    'how_to_pay', v_settings.how_to_pay,
    'paypal_me', v_settings.paypal_me,
    'bills', coalesce((
      select jsonb_agg(jsonb_build_object(
        'month', b.month,
        'amount', b.amount,
        'currency', m.currency,
        'paid_at', b.paid_at,
        'reported_paid_at', b.reported_paid_at,
        'reported_ref', b.reported_ref,
        'reported_method', b.reported_method,
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
