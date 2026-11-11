import { useMemo, useRef, useState, type DragEvent, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronLeft, ExternalLink, FileText, Upload, ChevronRight, CircleAlert, Pencil, Plus, ReceiptText, Trash2, Undo2, X } from 'lucide-react'
import { FoldText } from '../components/FoldText'
import { Avatar } from '../components/Avatar'
import { BillStatusBadge } from '../components/BillStatusBadge'
import { Modal } from '../components/Modal'
import { Switch } from '../components/Switch'
import { Combobox } from '../components/Combobox'
import { ActionsMenu } from '../components/ActionsMenu'
import { TableCard } from '../components/TableToolbar'
import { confirmDialog } from '../lib/dialog'
import { errorMessage } from '../lib/api'
import { usePageTitle } from '../lib/usePageTitle'
import {
  INVOICE_MAX_BYTES,
  invoiceNote,
  invoicePath,
  invoiceUrl,
  readInvoicePdf,
  uploadInvoice,
  type InvoiceDetails,
} from '../lib/billingInvoice'
import {
  DUE_DAY,
  SUPABASE_BILLING_URL,
  billStatus,
  dueDate,
  fetchBillingLeads,
  fetchBillingMonths,
  fetchHowToPay,
  fetchLeadBills,
  formatMoney,
  formatPaidOn,
  manilaToday,
  monthLabel,
  monthOf,
  parseAmount,
  paypalLink,
  paypalMeName,
  setHowToPay,
  removeLeadBill,
  setBillingExempt,
  setLeadBillAmount,
  setLeadBillPaid,
  shiftMonth,
  startBillingMonth,
  type BillingCurrency,
  type BillingLead,
  type LeadBill,
} from '../lib/billing'

// Billing (admins only): who has paid their share of each month's Supabase bill.

function SupabaseBillingLink() {
  return (
    <a
      href={SUPABASE_BILLING_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-sm font-medium text-gray-600 underline hover:text-gray-900"
    >
      Open the bill in Supabase
      <ExternalLink className="h-3.5 w-3.5" aria-hidden />
    </a>
  )
}

interface PickedInvoice {
  file: File
  details: InvoiceDetails
}

/** Uploads the picked invoice (if any) into the month's folder, then saves the month's bill. */
async function saveMonth(month: string, amount: number, currency: BillingCurrency, note: string, invoice: PickedInvoice | null) {
  let attached: { path: string; number: string | null } | null = null
  if (invoice) {
    const path = invoicePath(month, invoice.details.invoiceNumber)
    await uploadInvoice(path, invoice.file)
    attached = { path, number: invoice.details.invoiceNumber }
  }
  return startBillingMonth(month, amount, currency, note, attached)
}

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** Pick or drop the Supabase invoice PDF; it's read in the browser to fill in the bill. */
function InvoicePicker({ invoice, onChange }: { invoice: PickedInvoice | null; onChange: (invoice: PickedInvoice | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [reading, setReading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')

  async function pick(file: File | undefined) {
    if (!file) return
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Choose the invoice PDF.')
      return
    }
    if (file.size > INVOICE_MAX_BYTES) {
      setError(`That file is ${formatSize(file.size)}; invoices can be up to 5 MB.`)
      return
    }
    setError('')
    setReading(true)
    try {
      const details = await readInvoicePdf(file)
      onChange({ file, details })
      if (details.amount === null) setError("Couldn't find the amount due in this PDF; enter it below. The PDF is still attached.")
    } catch {
      onChange({ file, details: { amount: null, currency: null, invoiceNumber: null, invoiceDate: null, period: null } })
      setError("Couldn't read this PDF; enter the amount below. The PDF is still attached.")
    } finally {
      setReading(false)
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    void pick(e.dataTransfer.files[0])
  }

  return (
    <div>
      {invoice ? (
        <div className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2">
          <FileText className="h-5 w-5 shrink-0 text-gray-400" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-gray-900">{invoice.file.name}</p>
            <p className="text-xs text-gray-500">
              PDF · {formatSize(invoice.file.size)}
              {invoice.details.amount !== null &&
                ` · ${formatMoney(invoice.details.amount, invoice.details.currency ?? 'USD')} due`}
              {invoice.details.invoiceDate && ` · dated ${invoice.details.invoiceDate}`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              onChange(null)
              setError('')
            }}
            aria-label="Remove the invoice"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`flex flex-wrap items-center gap-3 rounded-lg border border-dashed px-3 py-3 transition-colors duration-100 ${
            dragging ? 'border-accent bg-accent-bg' : 'border-gray-300'
          }`}
        >
          <button type="button" onClick={() => inputRef.current?.click()} aria-busy={reading} className={secondaryButton}>
            <Upload className="h-4 w-4" aria-hidden />
            {reading ? 'Reading...' : 'Upload invoice'}
          </button>
          <span className="text-xs text-gray-500">{dragging ? 'Drop the PDF to read it' : 'or drop the Supabase invoice PDF here. The amount is filled in from it.'}</span>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          void pick(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      {error && <p className="mt-1 text-xs text-status-warning-text">{error}</p>}
    </div>
  )
}

/** Opens the month's stored invoice in a new tab (through a link that works for a minute). */
async function openInvoice(path: string) {
  const tab = window.open('', '_blank')
  try {
    const url = await invoiceUrl(path)
    if (tab) {
      tab.opener = null
      tab.location.href = url
    } else {
      window.location.href = url
    }
  } catch (err) {
    tab?.close()
    throw err
  }
}

const inputClass = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent'
const primaryButton =
  'inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground'
const secondaryButton =
  'inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50'

type Editing =
  | { kind: 'month' }
  | { kind: 'amount'; bill: LeadBill }
  | { kind: 'paid'; bill: LeadBill }
  | { kind: 'add' }

export function Billing() {
  usePageTitle('Billing')
  const queryClient = useQueryClient()
  const today = manilaToday()
  const [month, setMonth] = useState(() => monthOf(today))
  const [editing, setEditing] = useState<Editing | null>(null)
  const [actionError, setActionError] = useState('')

  const leadsQuery = useQuery({ queryKey: ['billing', 'leads'], queryFn: fetchBillingLeads })
  const monthsQuery = useQuery({ queryKey: ['billing', 'months'], queryFn: fetchBillingMonths })
  const billsQuery = useQuery({ queryKey: ['billing', 'bills'], queryFn: fetchLeadBills })

  const leads = useMemo(() => leadsQuery.data ?? [], [leadsQuery.data])
  const leadById = useMemo(() => new Map(leads.map((lead) => [lead.id, lead])), [leads])
  const allBills = useMemo(() => billsQuery.data ?? [], [billsQuery.data])
  const billingMonth = monthsQuery.data?.find((m) => m.month === month) ?? null
  const currency = billingMonth?.currency ?? 'PHP'

  const bills = allBills
    .filter((bill) => bill.month === month)
    .sort((a, b) => (leadById.get(a.leadId)?.name ?? '').localeCompare(leadById.get(b.leadId)?.name ?? ''))
  const billed = bills.reduce((sum, bill) => sum + bill.amount, 0)
  const collected = bills.reduce((sum, bill) => sum + (bill.paidAt ? bill.amount : 0), 0)
  const unpaidCount = bills.filter((bill) => !bill.paidAt).length

  const earlierUnpaid = useMemo(() => {
    const byMonth = new Map<string, string[]>()
    for (const bill of allBills) {
      if (bill.paidAt || bill.month >= month) continue
      byMonth.set(bill.month, [...(byMonth.get(bill.month) ?? []), leadById.get(bill.leadId)?.name ?? 'A removed lead'])
    }
    return [...byMonth.entries()].sort(([a], [b]) => b.localeCompare(a))
  }, [allBills, month, leadById])

  const payingLeads = leads.filter((lead) => lead.isActive && !lead.exempt)
  const unbilledLeads = leads.filter((lead) => !bills.some((bill) => bill.leadId === lead.id))

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['billing'] })

  const exemptMutation = useMutation({
    mutationFn: ({ lead, exempt }: { lead: BillingLead; exempt: boolean }) => setBillingExempt(lead.id, exempt),
    onSuccess: refresh,
    onError: (err) => setActionError(errorMessage(err, 'Could not change who is billed.')),
  })

  async function markUnpaid(bill: LeadBill) {
    const name = leadById.get(bill.leadId)?.name ?? 'this lead'
    const ok = await confirmDialog(`Mark ${name}'s ${monthLabel(bill.month)} bill as unpaid? The paid date and note are cleared.`, {
      title: 'Mark as unpaid?',
      confirmLabel: 'Mark unpaid',
    })
    if (!ok) return
    try {
      await setLeadBillPaid(bill.month, bill.leadId, false, '')
      setActionError('')
      await refresh()
    } catch (err) {
      setActionError(errorMessage(err, 'Could not mark it unpaid.'))
    }
  }

  async function remove(bill: LeadBill) {
    const name = leadById.get(bill.leadId)?.name ?? 'this lead'
    const ok = await confirmDialog(`Take ${name} off the ${monthLabel(bill.month)} bill? Their share and paid status are deleted.`, {
      title: 'Remove from this month?',
      confirmLabel: 'Remove',
      danger: true,
    })
    if (!ok) return
    try {
      await removeLeadBill(bill.month, bill.leadId)
      setActionError('')
      await refresh()
    } catch (err) {
      setActionError(errorMessage(err, 'Could not remove the bill.'))
    }
  }

  const loading = leadsQuery.isLoading || monthsQuery.isLoading || billsQuery.isLoading
  const loadError = leadsQuery.error ?? monthsQuery.error ?? billsQuery.error
  const isCurrentMonth = month === monthOf(today)

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-medium text-gray-900 sm:text-4xl">
            <FoldText text="Billing" />
          </h1>
          <p className="text-sm text-gray-500">The leads' shares of the monthly Supabase bill, due by the {DUE_DAY}th of each month.</p>
          <div className="mt-1">
            <SupabaseBillingLink />
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMonth(shiftMonth(month, -1))}
            aria-label="Previous month"
            className="flex h-11 w-11 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <span className="min-w-36 text-center text-sm font-semibold text-gray-900">{monthLabel(month)}</span>
          <button
            type="button"
            onClick={() => setMonth(shiftMonth(month, 1))}
            aria-label="Next month"
            className="flex h-11 w-11 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
          >
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
          {!isCurrentMonth && (
            <button type="button" onClick={() => setMonth(monthOf(today))} className="ml-1 text-sm font-medium text-gray-500 underline">
              This month
            </button>
          )}
        </div>
      </div>

      {(loadError || actionError) && (
        <div role="alert" className="mb-4 rounded-lg bg-status-danger-bg px-4 py-2.5 text-sm text-status-danger-text">
          {actionError || errorMessage(loadError, 'Could not load billing.')}
        </div>
      )}

      {earlierUnpaid.length > 0 && (
        <div className="mb-4 rounded-lg bg-status-warning-bg px-4 py-3 text-sm text-status-warning-text">
          <p className="flex items-center gap-1.5 font-semibold">
            <CircleAlert className="h-4 w-4" aria-hidden />
            Still unpaid from earlier months
          </p>
          <ul className="mt-1 space-y-0.5">
            {earlierUnpaid.map(([earlier, names]) => (
              <li key={earlier}>
                <button type="button" onClick={() => setMonth(earlier)} className="font-medium underline">
                  {monthLabel(earlier)}
                </button>
                : {names.join(', ')}
              </li>
            ))}
          </ul>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : !billingMonth ? (
        <StartMonth month={month} payingLeads={payingLeads} onStarted={refresh} />
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <div className="card p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Supabase bill</p>
              <p className="mt-1 text-2xl font-medium tabular-nums text-gray-900">{formatMoney(billingMonth.supabaseAmount, currency)}</p>
              {billingMonth.note && <p className="mt-1 text-xs text-gray-500">{billingMonth.note}</p>}
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                <button type="button" onClick={() => setEditing({ kind: 'month' })} className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 underline">
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                  {billingMonth.invoicePath ? 'Edit' : 'Edit or attach invoice'}
                </button>
                {billingMonth.invoicePath && (
                  <button
                    type="button"
                    onClick={() => openInvoice(billingMonth.invoicePath!).catch((err) => setActionError(errorMessage(err, 'Could not open the invoice.')))}
                    className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 underline"
                  >
                    <FileText className="h-3.5 w-3.5" aria-hidden />
                    {billingMonth.invoiceNumber ? `Invoice ${billingMonth.invoiceNumber}` : 'Invoice'}
                  </button>
                )}
              </div>
            </div>
            <div className="card p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Collected</p>
              <p className="mt-1 text-2xl font-medium tabular-nums text-gray-900">{formatMoney(collected, currency)}</p>
              <p className="mt-1 text-xs text-gray-500">of {formatMoney(billed, currency)} billed to the leads</p>
            </div>
            <div className="card p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Unpaid</p>
              <p className="mt-1 text-2xl font-medium tabular-nums text-gray-900">
                {unpaidCount} of {bills.length}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Due {new Date(`${dueDate(month)}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
              </p>
            </div>
          </div>

          <TableCard
            footer={
              unbilledLeads.length > 0 && (
                <div className="border-t border-gray-200 px-4 py-3">
                  <button type="button" onClick={() => setEditing({ kind: 'add' })} className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900">
                    <Plus className="h-4 w-4" aria-hidden />
                    Add a lead to {monthLabel(month)}
                  </button>
                </div>
              )
            }
          >
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Lead</th>
                  <th className="px-4 py-3 text-right font-semibold">Share</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Paid on</th>
                  <th className="px-4 py-3 font-semibold">Note</th>
                  <th className="px-4 py-3 text-right font-semibold">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {bills.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                      No leads are billed for {monthLabel(month)}.
                    </td>
                  </tr>
                )}
                {bills.map((bill) => {
                  const lead = leadById.get(bill.leadId)
                  return (
                    <tr key={bill.leadId}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar name={lead?.name ?? '?'} photoUrl={lead?.avatarUrl} size={32} />
                          <div className="min-w-0">
                            <div className="font-medium text-gray-900">{lead?.name ?? 'Removed lead'}</div>
                            <div className="truncate text-xs text-gray-400">{lead?.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-900">{formatMoney(bill.amount, currency)}</td>
                      <td className="px-4 py-3">
                        <BillStatusBadge status={billStatus(bill, today)} />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-600">{bill.paidAt ? formatPaidOn(bill.paidAt) : '—'}</td>
                      <td className="max-w-56 px-4 py-3 text-gray-600">
                        <span className="line-clamp-2 break-words">{bill.note ?? '—'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {bill.paidAt ? (
                            <button type="button" onClick={() => markUnpaid(bill)} className={`${secondaryButton} whitespace-nowrap px-3 py-1.5`}>
                              <Undo2 className="h-4 w-4" aria-hidden />
                              Mark unpaid
                            </button>
                          ) : (
                            <button type="button" onClick={() => setEditing({ kind: 'paid', bill })} className={`${primaryButton} whitespace-nowrap px-3 py-1.5`}>
                              <Check className="h-4 w-4" aria-hidden />
                              Mark paid
                            </button>
                          )}
                          <ActionsMenu
                            label={`More for ${lead?.name ?? 'this lead'}`}
                            items={[
                              { label: 'Change share', icon: Pencil, onClick: () => setEditing({ kind: 'amount', bill }) },
                              ...(bill.paidAt ? [{ label: 'Edit note', icon: ReceiptText, onClick: () => setEditing({ kind: 'paid', bill }) }] : []),
                              { label: 'Remove from this month', icon: Trash2, variant: 'danger' as const, onClick: () => remove(bill) },
                            ]}
                          />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </TableCard>
        </>
      )}

      {!loading && <HowToPayCard />}

      {!loading && leads.length > 0 && (
        <div className="mt-4 card p-5">
          <p className="text-sm font-semibold text-gray-700">Who pays</p>
          <p className="mb-3 text-xs text-gray-400">Leads switched off here aren't billed when a new month is started. Months already started don't change.</p>
          <ul className="divide-y divide-gray-100">
            {leads.map((lead) => (
              <li key={lead.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={lead.name} photoUrl={lead.avatarUrl} size={28} />
                  <span className="truncate text-sm text-gray-900">{lead.name}</span>
                  {!lead.isActive && <span className="text-xs text-gray-400">Disabled</span>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">{lead.exempt ? 'Not billed' : 'Billed'}</span>
                  <Switch
                    checked={!lead.exempt}
                    disabled={exemptMutation.isPending}
                    onChange={(billedNext) => exemptMutation.mutate({ lead, exempt: !billedNext })}
                    label={`Bill ${lead.name}`}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {editing?.kind === 'month' && billingMonth && (
        <MonthModal
          month={month}
          initial={{ amount: billingMonth.supabaseAmount.toFixed(2), currency: billingMonth.currency, note: billingMonth.note ?? '', hasInvoice: Boolean(billingMonth.invoicePath) }}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      )}
      {editing?.kind === 'amount' && (
        <AmountModal
          title={`Change share — ${leadById.get(editing.bill.leadId)?.name ?? ''}`}
          month={month}
          currency={currency}
          leadOptions={null}
          initialLeadId={editing.bill.leadId}
          initialAmount={String(editing.bill.amount)}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      )}
      {editing?.kind === 'add' && (
        <AmountModal
          title={`Add a lead to ${monthLabel(month)}`}
          month={month}
          currency={currency}
          leadOptions={unbilledLeads}
          initialLeadId=""
          initialAmount={bills[0] ? String(bills[0].amount) : ''}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      )}
      {editing?.kind === 'paid' && (
        <PaidModal
          bill={editing.bill}
          leadName={leadById.get(editing.bill.leadId)?.name ?? 'this lead'}
          amountLabel={formatMoney(editing.bill.amount, currency)}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      )}
    </div>
  )
}

function StartMonth({ month, payingLeads, onStarted }: { month: string; payingLeads: BillingLead[]; onStarted: () => void }) {
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState<BillingCurrency>('PHP')
  const [note, setNote] = useState('')
  const [invoice, setInvoice] = useState<PickedInvoice | null>(null)
  const [error, setError] = useState('')
  const mutation = useMutation({
    mutationFn: (value: number) => saveMonth(month, value, currency, note, invoice),
    onSuccess: () => onStarted(),
    onError: (err) => setError(errorMessage(err, 'Could not start the month.')),
  })

  function pickInvoice(next: PickedInvoice | null) {
    setInvoice(next)
    if (!next) return
    if (next.details.amount !== null) setAmount(next.details.amount.toFixed(2))
    if (next.details.currency) setCurrency(next.details.currency)
    const auto = invoiceNote(next.details)
    if (auto) setNote(auto)
  }
  const parsed = parseAmount(amount)
  const share = parsed !== null && payingLeads.length > 0 ? Math.round((parsed / payingLeads.length) * 100) / 100 : null

  function submit(e: FormEvent) {
    e.preventDefault()
    if (mutation.isPending) return
    if (parsed === null) {
      setError('Enter what Supabase charged, e.g. 1450 or 1,450.50.')
      document.getElementById('billing-amount')?.focus()
      return
    }
    setError('')
    mutation.mutate(parsed)
  }

  return (
    <form onSubmit={submit} className="card max-w-xl p-5" noValidate>
      <p className="text-base font-semibold text-gray-900">{monthLabel(month)} isn't billed yet</p>
      <p className="mb-4 text-sm text-gray-500">
        Enter what Supabase charged. It's split equally across the {payingLeads.length} lead{payingLeads.length === 1 ? '' : 's'} who pay; you can change each share afterwards.
      </p>
      <div className="mb-3">
        <InvoicePicker invoice={invoice} onChange={pickInvoice} />
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <label htmlFor="billing-amount" className="mb-1 block text-sm font-medium text-gray-700">
            Supabase bill
          </label>
          <input
            id="billing-amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="e.g. 1450"
            aria-invalid={Boolean(error) && parsed === null}
            className={`${inputClass} tabular-nums`}
          />
        </div>
        <div>
          <label htmlFor="billing-currency" className="mb-1 block text-sm font-medium text-gray-700">
            Currency
          </label>
          <select id="billing-currency" value={currency} onChange={(e) => setCurrency(e.target.value as BillingCurrency)} className={inputClass}>
            <option value="PHP">PHP</option>
            <option value="USD">USD</option>
          </select>
        </div>
      </div>
      <label htmlFor="billing-note" className="mb-1 mt-3 block text-sm font-medium text-gray-700">
        Note <span className="font-normal text-gray-400">(optional)</span>
      </label>
      <input id="billing-note" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Pro plan + compute" className={inputClass} />

      {payingLeads.length > 0 && (
        <p className="mt-4 text-sm text-gray-600">
          {share !== null ? `${formatMoney(share, currency)} each: ` : 'Billed: '}
          {payingLeads.map((lead) => lead.name).join(', ')}
        </p>
      )}
      {error && <p className="mt-3 text-sm text-status-danger-text">{error}</p>}
      <div className="mt-4">
        <button type="submit" aria-busy={mutation.isPending} className={primaryButton}>
          <ReceiptText className="h-4 w-4" aria-hidden />
          {mutation.isPending ? 'Billing...' : `Bill ${payingLeads.length} lead${payingLeads.length === 1 ? '' : 's'}`}
        </button>
      </div>
    </form>
  )
}

function ModalButtons({ onClose, pending, label, icon: Icon }: { onClose: () => void; pending: boolean; label: string; icon: typeof Check }) {
  return (
    <div className="mt-2 flex justify-end gap-2">
      <button type="button" onClick={onClose} className={secondaryButton}>
        <X className="h-4 w-4" aria-hidden />
        Cancel
      </button>
      <button type="submit" aria-busy={pending} className={primaryButton}>
        <Icon className="h-4 w-4" aria-hidden />
        {pending ? 'Saving...' : label}
      </button>
    </div>
  )
}

function MonthModal({
  month,
  initial,
  onClose,
  onSaved,
}: {
  month: string
  initial: { amount: string; currency: BillingCurrency; note: string; hasInvoice: boolean }
  onClose: () => void
  onSaved: () => void
}) {
  const [amount, setAmount] = useState(initial.amount)
  const [currency, setCurrency] = useState(initial.currency)
  const [note, setNote] = useState(initial.note)
  const [invoice, setInvoice] = useState<PickedInvoice | null>(null)
  const [error, setError] = useState('')
  const mutation = useMutation({
    mutationFn: (value: number) => saveMonth(month, value, currency, note, invoice),
    onSuccess: () => {
      onSaved()
      onClose()
    },
    onError: (err) => setError(errorMessage(err, 'Could not save.')),
  })

  function pickInvoice(next: PickedInvoice | null) {
    setInvoice(next)
    if (!next) return
    if (next.details.amount !== null) setAmount(next.details.amount.toFixed(2))
    if (next.details.currency) setCurrency(next.details.currency)
    const auto = invoiceNote(next.details)
    if (auto) setNote(auto)
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (mutation.isPending) return
    const parsed = parseAmount(amount)
    if (parsed === null) {
      setError('Enter what Supabase charged, e.g. 1450 or 1,450.50.')
      return
    }
    mutation.mutate(parsed)
  }

  return (
    <Modal title={`${monthLabel(month)} Supabase bill`} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
        <p className="text-sm text-gray-500">This doesn't change the leads' shares; change those one by one.</p>
        <InvoicePicker invoice={invoice} onChange={pickInvoice} />
        {initial.hasInvoice && !invoice && <p className="-mt-2 text-xs text-gray-400">Uploading another invoice replaces the one attached.</p>}
        <div className="flex gap-2">
          <div className="flex-1">
            <label htmlFor="month-amount" className="mb-1 block text-sm font-medium text-gray-700">
              Supabase bill
            </label>
            <input id="month-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${inputClass} tabular-nums`} />
          </div>
          <div>
            <label htmlFor="month-currency" className="mb-1 block text-sm font-medium text-gray-700">
              Currency
            </label>
            <select id="month-currency" value={currency} onChange={(e) => setCurrency(e.target.value as BillingCurrency)} className={inputClass}>
              <option value="PHP">PHP</option>
              <option value="USD">USD</option>
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="month-note" className="mb-1 block text-sm font-medium text-gray-700">
            Note <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <input id="month-note" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} className={inputClass} />
        </div>
        {error && <div className="text-sm text-status-danger-text">{error}</div>}
        <ModalButtons onClose={onClose} pending={mutation.isPending} label="Save" icon={Check} />
      </form>
    </Modal>
  )
}

function AmountModal({
  title,
  month,
  currency,
  leadOptions,
  initialLeadId,
  initialAmount,
  onClose,
  onSaved,
}: {
  title: string
  month: string
  currency: BillingCurrency
  // The leads to pick from when adding one; null when changing an existing share.
  leadOptions: BillingLead[] | null
  initialLeadId: string
  initialAmount: string
  onClose: () => void
  onSaved: () => void
}) {
  const [leadId, setLeadId] = useState(initialLeadId)
  const [amount, setAmount] = useState(initialAmount)
  const [error, setError] = useState('')
  const mutation = useMutation({
    mutationFn: (value: number) => setLeadBillAmount(month, leadId, value),
    onSuccess: () => {
      onSaved()
      onClose()
    },
    onError: (err) => setError(errorMessage(err, 'Could not save.')),
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    if (mutation.isPending) return
    if (!leadId) {
      setError('Choose a lead.')
      return
    }
    const parsed = parseAmount(amount)
    if (parsed === null) {
      setError('Enter an amount, e.g. 250 or 250.50.')
      document.getElementById('share-amount')?.focus()
      return
    }
    mutation.mutate(parsed)
  }

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
        {leadOptions && (
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Lead</label>
            <Combobox
              value={leadId}
              onChange={setLeadId}
              options={leadOptions.map((lead) => ({ value: lead.id, label: lead.name }))}
              placeholder="Search leads..."
              className="w-full"
            />
          </div>
        )}
        <div>
          <label htmlFor="share-amount" className="mb-1 block text-sm font-medium text-gray-700">
            Share ({currency})
          </label>
          <input id="share-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${inputClass} tabular-nums`} />
        </div>
        {error && <div className="text-sm text-status-danger-text">{error}</div>}
        <ModalButtons onClose={onClose} pending={mutation.isPending} label={leadOptions ? 'Add' : 'Save'} icon={leadOptions ? Plus : Check} />
      </form>
    </Modal>
  )
}

function PaidModal({
  bill,
  leadName,
  amountLabel,
  onClose,
  onSaved,
}: {
  bill: LeadBill
  leadName: string
  amountLabel: string
  onClose: () => void
  onSaved: () => void
}) {
  const [note, setNote] = useState(bill.note ?? '')
  const [error, setError] = useState('')
  const mutation = useMutation({
    mutationFn: () => setLeadBillPaid(bill.month, bill.leadId, true, note),
    onSuccess: () => {
      onSaved()
      onClose()
    },
    onError: (err) => setError(errorMessage(err, 'Could not mark it paid.')),
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!mutation.isPending) mutation.mutate()
  }

  return (
    <Modal title={bill.paidAt ? `Edit note — ${leadName}` : `Mark paid — ${leadName}`} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
        {!bill.paidAt && (
          <p className="text-sm text-gray-600">
            {leadName} paid {amountLabel} for {monthLabel(bill.month)}.
          </p>
        )}
        <div>
          <label htmlFor="paid-note" className="mb-1 block text-sm font-medium text-gray-700">
            Note <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <input
            id="paid-note"
            value={note}
            maxLength={300}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. GCash ref 1234567890"
            className={inputClass}
            autoFocus
          />
        </div>
        {error && <div className="text-sm text-status-danger-text">{error}</div>}
        <ModalButtons onClose={onClose} pending={mutation.isPending} label={bill.paidAt ? 'Save' : 'Mark paid'} icon={Check} />
      </form>
    </Modal>
  )
}

/** The admin's PayPal.Me name and a note, shown to the billed leads on their Billing page. */
function HowToPayCard() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['billing', 'how-to-pay'], queryFn: fetchHowToPay })
  const [draft, setDraft] = useState<{ paypal: string; note: string } | null>(null)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const paypal = draft?.paypal ?? data?.paypalMe ?? ''
  const note = draft?.note ?? data?.note ?? ''
  const name = paypalMeName(paypal)

  const mutation = useMutation({
    mutationFn: () => setHowToPay(name ?? '', note),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['billing', 'how-to-pay'] })
      setDraft(null)
      setSaved(true)
    },
    onError: (err) => setError(errorMessage(err, 'Could not save.')),
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    if (mutation.isPending) return
    setSaved(false)
    if (paypal.trim() && !name) {
      setError("That isn't a PayPal.Me name. Enter the part after paypal.me/, e.g. paypal.me/yourname → yourname.")
      document.getElementById('paypal-me')?.focus()
      return
    }
    setError('')
    mutation.mutate()
  }

  if (isLoading) return null
  return (
    <form onSubmit={submit} className="mt-8 card p-5" noValidate>
      <p className="text-sm font-semibold text-gray-700">How leads pay</p>
      <p className="mb-3 text-xs text-gray-400">
        Billed leads see a Pay with PayPal button on their Billing page with their share filled in, plus your note.
      </p>
      <label htmlFor="paypal-me" className="mb-1 block text-sm font-medium text-gray-700">
        PayPal.Me name
      </label>
      <div className="flex items-center rounded-lg border border-gray-200 focus-within:border-accent">
        <span className="pl-3 text-sm text-gray-400">paypal.me/</span>
        <input
          id="paypal-me"
          value={paypal}
          onChange={(e) => {
            setDraft({ paypal: e.target.value, note })
            setSaved(false)
          }}
          placeholder="yourname"
          autoComplete="off"
          className="w-full bg-transparent px-1 py-2 text-sm outline-none"
        />
      </div>
      {name && (
        <a href={paypalLink(name, 1, 'USD')} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-gray-500 underline">
          Test the link ($1.00, nothing is charged until you confirm)
          <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
      )}
      <label htmlFor="pay-note" className="mb-1 mt-3 block text-sm font-medium text-gray-700">
        Note <span className="font-normal text-gray-400">(optional)</span>
      </label>
      <textarea
        id="pay-note"
        value={note}
        maxLength={1000}
        rows={2}
        onChange={(e) => {
          setDraft({ paypal, note: e.target.value })
          setSaved(false)
        }}
        placeholder="e.g. Send as Friends and Family. Message me after paying."
        className={inputClass}
      />
      {error && <p className="mt-2 text-sm text-status-danger-text">{error}</p>}
      <div className="mt-3 flex items-center gap-3">
        <button type="submit" aria-busy={mutation.isPending} className={primaryButton}>
          <Check className="h-4 w-4" aria-hidden />
          {mutation.isPending ? 'Saving...' : 'Save'}
        </button>
        {saved && <span className="text-sm text-status-success-text">Saved</span>}
      </div>
    </form>
  )
}
