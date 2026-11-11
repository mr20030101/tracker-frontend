-- ============================================================================================
-- "I've paid": after paying through PayPal.Me, a lead reports it with PayPal's transaction ID. The
-- share shows Awaiting confirmation until an admin marks it paid, or marks it unpaid (not received),
-- which clears the report. Run after 20261111_billing_how_to_pay.sql.
-- ============================================================================================

alter table public.lead_bills add column if not exists reported_paid_at timestamptz;
alter table public.lead_bills add column if not exists reported_ref text check (reported_ref ~ '^[A-Za-z0-9-]{6,40}$');

-- A lead reports their own unpaid share as paid, with the transaction ID. Reporting again replaces it.
create or replace function public.report_bill_paid(p_month date, p_ref text)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_ref text := upper(regexp_replace(coalesce(p_ref, ''), '\s', '', 'g'));
  v_paid timestamptz;
  v_found boolean;
begin
  if not exists (
    select 1 from public.profiles where id = auth.uid() and role = 'lead' and is_active and not must_change_password
  ) then
    raise exception 'Only a lead can report a payment.';
  end if;
  if v_ref !~ '^[A-Z0-9-]{6,40}$' then
    raise exception 'Enter the transaction ID from PayPal (letters and numbers, e.g. 5TY05013RG002845M).';
  end if;
  select true, paid_at into v_found, v_paid from public.lead_bills where month = p_month and lead_id = auth.uid();
  if v_found is null then
    raise exception 'You aren''t billed for that month.';
  end if;
  if v_paid is not null then
    raise exception 'That month is already marked paid.';
  end if;

  update public.lead_bills set reported_paid_at = now(), reported_ref = v_ref
  where month = p_month and lead_id = auth.uid();

  perform public.write_audit('bill_reported_paid', auth.uid(),
    (select name from public.profiles where id = auth.uid()) || ' reported paying their '
      || public.billing_month_label(p_month) || ' bill (PayPal ' || v_ref || ')',
    jsonb_build_object('month', p_month, 'lead_id', auth.uid(), 'ref', v_ref));
end;
$$;

revoke execute on function public.report_bill_paid(date, text) from public, anon;
grant execute on function public.report_bill_paid(date, text) to authenticated;

-- Marking a share unpaid now also clears the lead's report (the payment wasn't received).
create or replace function public.set_lead_bill_paid(p_month date, p_lead_id uuid, p_paid boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_name text;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_was_paid boolean;
  v_was_reported boolean;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can manage billing.';
  end if;
  if p_paid is null then
    raise exception 'Choose paid or unpaid.';
  end if;
  if char_length(v_note) > 300 then
    raise exception 'Keep the note under 300 characters.';
  end if;
  select paid_at is not null, reported_paid_at is not null into v_was_paid, v_was_reported
  from public.lead_bills where month = p_month and lead_id = p_lead_id;
  if v_was_paid is null then
    raise exception 'That lead isn''t billed for that month.';
  end if;
  v_name := public.billing_lead_name(p_lead_id);

  update public.lead_bills
  set paid_at = case when p_paid then coalesce(case when v_was_paid then paid_at end, now()) end,
      paid_marked_by = case when p_paid then auth.uid() end,
      note = v_note,
      reported_paid_at = case when p_paid then reported_paid_at end,
      reported_ref = case when p_paid then reported_ref end
  where month = p_month and lead_id = p_lead_id;

  if v_was_paid <> p_paid or (not p_paid and v_was_reported) then
    perform public.write_audit(case when p_paid then 'bill_paid' else 'bill_unpaid' end, p_lead_id,
      case
        when p_paid then 'Marked ' || v_name || '''s ' || public.billing_month_label(p_month) || ' bill paid'
        when v_was_reported and not v_was_paid then 'Didn''t receive ' || v_name || '''s reported ' || public.billing_month_label(p_month) || ' payment; marked it unpaid'
        else 'Marked ' || v_name || '''s ' || public.billing_month_label(p_month) || ' bill unpaid'
      end,
      jsonb_build_object('month', p_month, 'lead_id', p_lead_id, 'note', v_note));
  end if;
end;
$$;

revoke execute on function public.set_lead_bill_paid(date, uuid, boolean, text) from public, anon;
grant execute on function public.set_lead_bill_paid(date, uuid, boolean, text) to authenticated;

-- my_billing() now also returns each bill's report.
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
