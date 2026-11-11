-- ============================================================================================
-- "How to pay" on the Billing page: the admin's PayPal.Me name (leads get a "Pay with PayPal" button
-- with their share filled in) and an optional note, shown to every billed lead on their own Billing
-- page. Run after 20261111_my_billing.sql.
-- ============================================================================================

create table if not exists public.billing_settings (
  id boolean primary key default true check (id),
  paypal_me text check (paypal_me ~ '^[A-Za-z0-9]{1,20}$'),
  how_to_pay text check (char_length(how_to_pay) <= 1000),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.billing_settings enable row level security;
drop policy if exists "admins read billing settings" on public.billing_settings;
create policy "admins read billing settings" on public.billing_settings for select using (public.is_admin());

-- p_paypal_me: the name after paypal.me/ (a full paypal.me link is cut down to it).
create or replace function public.set_billing_how_to_pay(p_paypal_me text, p_text text)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_paypal text := nullif(regexp_replace(trim(coalesce(p_paypal_me, '')), '^(https?://)?(www\.)?paypal\.me/|/.*$|^@', '', 'gi'), '');
  v_text text := nullif(trim(coalesce(p_text, '')), '');
  v_old public.billing_settings;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can manage billing.';
  end if;
  if v_paypal is not null and v_paypal !~ '^[A-Za-z0-9]{1,20}$' then
    raise exception 'That isn''t a PayPal.Me name. It''s the part after paypal.me/, letters and numbers only.';
  end if;
  if char_length(v_text) > 1000 then
    raise exception 'Keep the note under 1,000 characters.';
  end if;
  select * into v_old from public.billing_settings where id;
  if v_old.paypal_me is not distinct from v_paypal and v_old.how_to_pay is not distinct from v_text then
    return;
  end if;

  insert into public.billing_settings (id, paypal_me, how_to_pay, updated_by) values (true, v_paypal, v_text, auth.uid())
  on conflict (id) do update
    set paypal_me = excluded.paypal_me, how_to_pay = excluded.how_to_pay, updated_by = excluded.updated_by, updated_at = now();

  perform public.write_audit('billing_how_to_pay_changed', null,
    'Changed how leads pay their bills' || case when v_paypal is null then '' else ' (PayPal.Me: ' || v_paypal || ')' end,
    jsonb_build_object('paypal_me', v_paypal, 'how_to_pay', v_text));
end;
$$;

revoke execute on function public.set_billing_how_to_pay(text, text) from public, anon;
grant execute on function public.set_billing_how_to_pay(text, text) to authenticated;

-- my_billing() now also returns how to pay (only to leads who are billed).
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
