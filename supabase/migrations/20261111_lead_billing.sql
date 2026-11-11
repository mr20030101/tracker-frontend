-- ============================================================================================
-- Billing (admins only): the leads share the Tracker's monthly Supabase bill, billed in the first
-- week of each month. An admin starts a month with what Supabase charged; it's split equally across
-- the leads who aren't exempt, each share can be changed, and each lead's share is marked paid or
-- unpaid. Every change goes through the functions below and into the Activity Log.
-- Run after 20261111_unclaim_request.sql.
-- ============================================================================================

create table if not exists public.billing_months (
  month date primary key check (extract(day from month) = 1),
  supabase_amount numeric(10, 2) not null check (supabase_amount >= 0),
  currency text not null default 'PHP' check (currency in ('PHP', 'USD')),
  note text check (char_length(note) <= 300),
  -- The Supabase invoice PDF, in the private billing-invoices bucket (it has the account holder's address).
  invoice_path text check (invoice_path ~ '^[0-9]{4}-[0-9]{2}/[A-Za-z0-9._-]{1,80}\.pdf$'),
  invoice_number text check (char_length(invoice_number) <= 60),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- For a database that ran this file before the invoice was added.
alter table public.billing_months add column if not exists invoice_path text
  check (invoice_path ~ '^[0-9]{4}-[0-9]{2}/[A-Za-z0-9._-]{1,80}\.pdf$');
alter table public.billing_months add column if not exists invoice_number text check (char_length(invoice_number) <= 60);

create table if not exists public.lead_bills (
  month date not null references public.billing_months(month) on delete cascade,
  lead_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric(10, 2) not null check (amount >= 0),
  paid_at timestamptz,
  paid_marked_by uuid references public.profiles(id) on delete set null,
  note text check (char_length(note) <= 300),
  primary key (month, lead_id)
);

create index if not exists lead_bills_lead_idx on public.lead_bills(lead_id);

-- Leads who are never billed.
create table if not exists public.billing_exempt_leads (
  lead_id uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.billing_months enable row level security;
alter table public.lead_bills enable row level security;
alter table public.billing_exempt_leads enable row level security;

drop policy if exists "admins read billing months" on public.billing_months;
create policy "admins read billing months" on public.billing_months for select using (public.is_admin());
drop policy if exists "admins read lead bills" on public.lead_bills;
create policy "admins read lead bills" on public.lead_bills for select using (public.is_admin());
drop policy if exists "admins read billing exemptions" on public.billing_exempt_leads;
create policy "admins read billing exemptions" on public.billing_exempt_leads for select using (public.is_admin());

-- Invoice PDFs: private, PDF only, up to 5 MB, read and written by admins only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('billing-invoices', 'billing-invoices', false, 5242880, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "admins read billing invoices" on storage.objects;
create policy "admins read billing invoices" on storage.objects for select
  using (bucket_id = 'billing-invoices' and public.is_admin());
drop policy if exists "admins upload billing invoices" on storage.objects;
create policy "admins upload billing invoices" on storage.objects for insert
  with check (bucket_id = 'billing-invoices' and public.is_admin());
drop policy if exists "admins replace billing invoices" on storage.objects;
create policy "admins replace billing invoices" on storage.objects for update
  using (bucket_id = 'billing-invoices' and public.is_admin())
  with check (bucket_id = 'billing-invoices' and public.is_admin());

create or replace function public.billing_month_label(p_month date)
returns text language sql immutable as $$ select to_char(p_month, 'FMMonth YYYY') $$;

create or replace function public.billing_lead_name(p_lead_id uuid)
returns text language plpgsql stable security definer set search_path = public
as $$
declare
  v_name text;
begin
  select name into v_name from public.profiles where id = p_lead_id and role = 'lead';
  if v_name is null then
    raise exception 'That lead was not found.';
  end if;
  return v_name;
end;
$$;

revoke execute on function public.billing_lead_name(uuid) from public, anon, authenticated;

drop function if exists public.start_billing_month(date, numeric, text, text);

-- Starts a month: records what Supabase charged and bills every active, non-exempt lead an equal
-- share. Run again on a started month, it only updates the amount, currency, note and invoice (a null
-- invoice keeps the one already attached).
create or replace function public.start_billing_month(
  p_month date, p_supabase_amount numeric, p_currency text, p_note text default null,
  p_invoice_path text default null, p_invoice_number text default null
)
returns integer language plpgsql security definer set search_path = public
as $$
declare
  v_month date := date_trunc('month', p_month)::date;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_invoice_number text := nullif(trim(coalesce(p_invoice_number, '')), '');
  v_leads uuid[];
  v_share numeric(10, 2);
begin
  if not public.is_admin() then
    raise exception 'Only an admin can manage billing.';
  end if;
  if p_month is null then
    raise exception 'Choose a month.';
  end if;
  if p_supabase_amount is null or p_supabase_amount < 0 or p_supabase_amount > 1000000 then
    raise exception 'Enter what Supabase charged, 0 or more.';
  end if;
  if p_currency is null or p_currency not in ('PHP', 'USD') then
    raise exception 'Choose PHP or USD.';
  end if;
  if char_length(v_note) > 300 then
    raise exception 'Keep the note under 300 characters.';
  end if;
  if p_invoice_path is not null and (p_invoice_path !~ '^[0-9]{4}-[0-9]{2}/[A-Za-z0-9._-]{1,80}\.pdf$' or left(p_invoice_path, 7) <> to_char(v_month, 'YYYY-MM')) then
    raise exception 'That invoice file isn''t in this month''s folder.';
  end if;
  if char_length(v_invoice_number) > 60 then
    raise exception 'That invoice number is too long.';
  end if;

  if exists (select 1 from public.billing_months where month = v_month) then
    update public.billing_months
    set supabase_amount = p_supabase_amount, currency = p_currency, note = v_note,
        invoice_path = coalesce(p_invoice_path, invoice_path),
        invoice_number = case when p_invoice_path is not null then v_invoice_number else invoice_number end
    where month = v_month;
    perform public.write_audit('billing_month_updated', null,
      'Updated the ' || public.billing_month_label(v_month) || ' Supabase bill to ' || p_currency || ' ' || p_supabase_amount,
      jsonb_build_object('month', v_month, 'supabase_amount', p_supabase_amount, 'currency', p_currency));
    return 0;
  end if;

  select array_agg(p.id order by p.name) into v_leads
  from public.profiles p
  where p.role = 'lead' and p.is_active
    and not exists (select 1 from public.billing_exempt_leads e where e.lead_id = p.id);

  insert into public.billing_months (month, supabase_amount, currency, note, invoice_path, invoice_number, created_by)
  values (v_month, p_supabase_amount, p_currency, v_note, p_invoice_path, v_invoice_number, auth.uid());

  if coalesce(array_length(v_leads, 1), 0) > 0 then
    v_share := round(p_supabase_amount / array_length(v_leads, 1), 2);
    insert into public.lead_bills (month, lead_id, amount)
    select v_month, unnest(v_leads), v_share;
  end if;

  perform public.write_audit('billing_month_started', null,
    'Started billing for ' || public.billing_month_label(v_month) || ': ' || p_currency || ' ' || p_supabase_amount
      || ' across ' || coalesce(array_length(v_leads, 1), 0) || ' leads',
    jsonb_build_object('month', v_month, 'supabase_amount', p_supabase_amount, 'currency', p_currency, 'leads', coalesce(array_length(v_leads, 1), 0)));
  return coalesce(array_length(v_leads, 1), 0);
end;
$$;

revoke execute on function public.start_billing_month(date, numeric, text, text, text, text) from public, anon;
grant execute on function public.start_billing_month(date, numeric, text, text, text, text) to authenticated;

-- Adds a lead to a started month, or changes their share.
create or replace function public.set_lead_bill_amount(p_month date, p_lead_id uuid, p_amount numeric)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_name text;
  v_currency text;
  v_old numeric;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can manage billing.';
  end if;
  if p_amount is null or p_amount < 0 or p_amount > 1000000 then
    raise exception 'Enter an amount, 0 or more.';
  end if;
  select currency into v_currency from public.billing_months where month = p_month;
  if v_currency is null then
    raise exception 'Start that month first.';
  end if;
  v_name := public.billing_lead_name(p_lead_id);

  select amount into v_old from public.lead_bills where month = p_month and lead_id = p_lead_id;
  if v_old = p_amount then
    return;
  end if;

  insert into public.lead_bills (month, lead_id, amount) values (p_month, p_lead_id, p_amount)
  on conflict (month, lead_id) do update set amount = excluded.amount;

  perform public.write_audit('bill_amount_changed', p_lead_id,
    case when v_old is null then 'Billed ' else 'Changed the bill of ' end || v_name || ' for '
      || public.billing_month_label(p_month) || ' to ' || v_currency || ' ' || p_amount,
    jsonb_build_object('month', p_month, 'lead_id', p_lead_id, 'old_amount', v_old, 'amount', p_amount));
end;
$$;

revoke execute on function public.set_lead_bill_amount(date, uuid, numeric) from public, anon;
grant execute on function public.set_lead_bill_amount(date, uuid, numeric) to authenticated;

-- Marks a lead's share paid (with an optional note, e.g. a GCash reference) or back to unpaid.
create or replace function public.set_lead_bill_paid(p_month date, p_lead_id uuid, p_paid boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_name text;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_was_paid boolean;
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
  select paid_at is not null into v_was_paid from public.lead_bills where month = p_month and lead_id = p_lead_id;
  if v_was_paid is null then
    raise exception 'That lead isn''t billed for that month.';
  end if;
  v_name := public.billing_lead_name(p_lead_id);

  update public.lead_bills
  set paid_at = case when p_paid then coalesce(case when v_was_paid then paid_at end, now()) end,
      paid_marked_by = case when p_paid then auth.uid() end,
      note = v_note
  where month = p_month and lead_id = p_lead_id;

  if v_was_paid <> p_paid then
    perform public.write_audit(case when p_paid then 'bill_paid' else 'bill_unpaid' end, p_lead_id,
      'Marked ' || v_name || '''s ' || public.billing_month_label(p_month) || ' bill ' || case when p_paid then 'paid' else 'unpaid' end,
      jsonb_build_object('month', p_month, 'lead_id', p_lead_id, 'note', v_note));
  end if;
end;
$$;

revoke execute on function public.set_lead_bill_paid(date, uuid, boolean, text) from public, anon;
grant execute on function public.set_lead_bill_paid(date, uuid, boolean, text) to authenticated;

-- Takes a lead off a month's bill (billed by mistake, or left the team).
create or replace function public.remove_lead_bill(p_month date, p_lead_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_name text;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can manage billing.';
  end if;
  v_name := public.billing_lead_name(p_lead_id);
  delete from public.lead_bills where month = p_month and lead_id = p_lead_id;
  if found then
    perform public.write_audit('bill_removed', p_lead_id,
      'Took ' || v_name || ' off the ' || public.billing_month_label(p_month) || ' bill',
      jsonb_build_object('month', p_month, 'lead_id', p_lead_id));
  end if;
end;
$$;

revoke execute on function public.remove_lead_bill(date, uuid) from public, anon;
grant execute on function public.remove_lead_bill(date, uuid) to authenticated;

-- A lead who is never billed (left out when a month is started).
create or replace function public.set_billing_exempt(p_lead_id uuid, p_exempt boolean)
returns void language plpgsql security definer set search_path = public
as $$
declare
  v_name text;
begin
  if not public.is_admin() then
    raise exception 'Only an admin can manage billing.';
  end if;
  if p_exempt is null then
    raise exception 'Choose billed or not billed.';
  end if;
  v_name := public.billing_lead_name(p_lead_id);
  if p_exempt then
    insert into public.billing_exempt_leads (lead_id) values (p_lead_id) on conflict do nothing;
  else
    delete from public.billing_exempt_leads where lead_id = p_lead_id;
  end if;
  if found then
    perform public.write_audit('billing_exempt_changed', p_lead_id,
      case when p_exempt then v_name || ' is no longer billed' else v_name || ' is billed again' end,
      jsonb_build_object('lead_id', p_lead_id, 'exempt', p_exempt));
  end if;
end;
$$;

revoke execute on function public.set_billing_exempt(uuid, boolean) from public, anon;
grant execute on function public.set_billing_exempt(uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
