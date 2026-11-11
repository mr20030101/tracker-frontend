import { supabase } from './api'

// Billing (admins only, 20261111_lead_billing.sql): the leads share the monthly Supabase bill,
// billed in the first week of each month.

export type BillingCurrency = 'PHP' | 'USD'

export interface BillingMonth {
  month: string
  supabaseAmount: number
  currency: BillingCurrency
  note: string | null
  invoicePath: string | null
  invoiceNumber: string | null
}

export interface LeadBill {
  month: string
  leadId: string
  amount: number
  paidAt: string | null
  note: string | null
}

export interface BillingLead {
  id: string
  name: string
  email: string
  avatarUrl: string | null
  isActive: boolean
  exempt: boolean
}

export type BillStatus = 'paid' | 'unpaid' | 'overdue'

/** Supabase's billing page for the Tracker's organization: the upcoming bill and past invoices. */
export const SUPABASE_BILLING_URL = 'https://supabase.com/dashboard/org/kaieubnplqplakvnzgbu/billing'

/** Bills are due by the 7th: the first week of the month. */
export const DUE_DAY = 7

/** Today's date in Manila, as YYYY-MM-DD. */
export function manilaToday(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
}

/** The first day of the month `date` (YYYY-MM-DD) falls in. */
export function monthOf(date: string): string {
  return `${date.slice(0, 7)}-01`
}

/** The first of the month `delta` months from `month`. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const index = y * 12 + (m - 1) + delta
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}-01`
}

export function monthLabel(month: string): string {
  return new Date(`${month}T00:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

export function dueDate(month: string): string {
  return `${month.slice(0, 8)}${String(DUE_DAY).padStart(2, '0')}`
}

export function billStatus(bill: Pick<LeadBill, 'month' | 'paidAt'>, today: string): BillStatus {
  if (bill.paidAt) return 'paid'
  return today > dueDate(bill.month) ? 'overdue' : 'unpaid'
}

export function formatMoney(amount: number, currency: BillingCurrency): string {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency, minimumFractionDigits: 2 }).format(amount)
}

/** Parses an amount typed by an admin ("1,250.50", "₱300"). Null when it isn't a usable amount. */
export function parseAmount(text: string): number | null {
  const cleaned = text.replace(/[₱$,\s]/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null
  const value = Number(cleaned)
  return value <= 1_000_000 ? value : null
}

export async function fetchBillingLeads(): Promise<BillingLead[]> {
  const [{ data: leads, error }, { data: exempt, error: exemptError }] = await Promise.all([
    supabase.from('profiles').select('id, name, email, avatar_url, is_active').eq('role', 'lead').order('name'),
    supabase.from('billing_exempt_leads').select('lead_id'),
  ])
  if (error) throw error
  if (exemptError) throw exemptError
  const exemptIds = new Set((exempt ?? []).map((row) => row.lead_id as string))
  return (leads ?? []).map((row) => ({
    id: row.id,
    name: row.name.trim(),
    email: row.email,
    avatarUrl: row.avatar_url,
    isActive: row.is_active,
    exempt: exemptIds.has(row.id),
  }))
}

export async function fetchBillingMonths(): Promise<BillingMonth[]> {
  const { data, error } = await supabase.from('billing_months').select('month, supabase_amount, currency, note, invoice_path, invoice_number').order('month', { ascending: false })
  if (error) throw error
  return (data ?? []).map((row) => ({
    month: row.month,
    supabaseAmount: Number(row.supabase_amount),
    currency: row.currency,
    note: row.note,
    invoicePath: row.invoice_path,
    invoiceNumber: row.invoice_number,
  }))
}

export async function fetchLeadBills(): Promise<LeadBill[]> {
  const { data, error } = await supabase.from('lead_bills').select('month, lead_id, amount, paid_at, note')
  if (error) throw error
  return (data ?? []).map((row) => ({
    month: row.month,
    leadId: row.lead_id,
    amount: Number(row.amount),
    paidAt: row.paid_at,
    note: row.note,
  }))
}

/**
 * Starts a month (bills every non-exempt lead an equal share), or updates a started one. `invoice`
 * attaches an uploaded invoice PDF; left out, a started month keeps the one it has. Returns how many leads were billed.
 */
export async function startBillingMonth(
  month: string,
  supabaseAmount: number,
  currency: BillingCurrency,
  note: string,
  invoice: { path: string; number: string | null } | null = null,
): Promise<number> {
  const { data, error } = await supabase.rpc('start_billing_month', {
    p_month: month,
    p_supabase_amount: supabaseAmount,
    p_currency: currency,
    p_note: note,
    p_invoice_path: invoice?.path ?? null,
    p_invoice_number: invoice?.number ?? null,
  })
  if (error) throw error
  return data as number
}

export async function setLeadBillAmount(month: string, leadId: string, amount: number): Promise<void> {
  const { error } = await supabase.rpc('set_lead_bill_amount', { p_month: month, p_lead_id: leadId, p_amount: amount })
  if (error) throw error
}

export async function setLeadBillPaid(month: string, leadId: string, paid: boolean, note: string): Promise<void> {
  const { error } = await supabase.rpc('set_lead_bill_paid', { p_month: month, p_lead_id: leadId, p_paid: paid, p_note: note })
  if (error) throw error
}

export async function removeLeadBill(month: string, leadId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_lead_bill', { p_month: month, p_lead_id: leadId })
  if (error) throw error
}

export async function setBillingExempt(leadId: string, exempt: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_billing_exempt', { p_lead_id: leadId, p_exempt: exempt })
  if (error) throw error
}
