import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ExternalLink, X } from 'lucide-react'
import { FoldText } from '../components/FoldText'
import { BillStatusBadge } from '../components/BillStatusBadge'
import { TableCard } from '../components/TableToolbar'
import { Modal } from '../components/Modal'
import { errorMessage } from '../lib/api'
import { usePageTitle } from '../lib/usePageTitle'
import {
  DUE_DAY,
  billStatus,
  dueDate,
  fetchMyBilling,
  formatMoney,
  formatPaidOn,
  manilaToday,
  monthLabel,
  paypalLink,
  paypalRef,
  reportBillPaid,
  type MyBill,
} from '../lib/billing'

// Billing for a lead: their own share of each month's Supabase bill. They pay through PayPal.Me,
// report it with the transaction ID, and an admin confirms it.

const primaryButton = 'inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground'
const secondaryButton =
  'inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50'

function longDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
}

function PayButton({ paypalMe, amount, currency, label }: { paypalMe: string; amount: number; currency: MyBill['currency']; label: string }) {
  return (
    <a href={paypalLink(paypalMe, amount, currency)} target="_blank" rel="noopener noreferrer" className={primaryButton}>
      {label}
      <ExternalLink className="h-4 w-4" aria-hidden />
    </a>
  )
}

export function MyBilling() {
  usePageTitle('Billing')
  const today = manilaToday()
  const { data, isLoading, error } = useQuery({ queryKey: ['my-billing'], queryFn: fetchMyBilling, staleTime: 60_000 })
  const [reporting, setReporting] = useState<MyBill[] | null>(null)

  const bills = data?.bills ?? []
  const unpaid = bills.filter((bill) => !bill.paidAt)
  // Still to pay: not paid and not reported as paid yet.
  const toPay = unpaid.filter((bill) => !bill.reportedPaidAt)
  const awaiting = unpaid.filter((bill) => bill.reportedPaidAt)
  const owed = toPay.reduce((sum, bill) => sum + bill.amount, 0)
  const latest = bills[0]
  const paypalMe = data?.paypalMe ?? null
  const oneCurrency = toPay.every((bill) => bill.currency === toPay[0]?.currency)

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-medium text-gray-900 sm:text-4xl">
          <FoldText text="Billing" />
        </h1>
        <p className="text-sm text-gray-500">Your share of the Tracker's monthly Supabase bill, due by the {DUE_DAY}th of each month.</p>
      </div>

      {error && (
        <div role="alert" className="mb-4 rounded-lg bg-status-danger-bg px-4 py-2.5 text-sm text-status-danger-text">
          {errorMessage(error, 'Could not load your bills.')}
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : data?.exempt && bills.length === 0 ? (
        <div className="card max-w-xl p-5">
          <p className="text-base font-semibold text-gray-900">You're not billed</p>
          <p className="text-sm text-gray-500">Your share of the Supabase bill is covered. Nothing to pay.</p>
        </div>
      ) : bills.length === 0 ? (
        <div className="card max-w-xl p-5">
          <p className="text-base font-semibold text-gray-900">No bills yet</p>
          <p className="text-sm text-gray-500">Your share shows here when a month is billed, in the first week of the month.</p>
        </div>
      ) : (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-2">
            <div className="card p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                {toPay.length > 0 ? 'To pay' : awaiting.length > 0 ? 'Waiting for confirmation' : 'All paid'}
              </p>
              <p className="mt-1 text-3xl font-medium tabular-nums text-gray-900">
                {formatMoney(owed, toPay[0]?.currency ?? latest.currency)}
              </p>
              <p className="mt-1 text-sm text-gray-500">
                {toPay.length === 0
                  ? awaiting.length > 0
                    ? "Thanks. You've reported paying; it's marked paid once the admin confirms it."
                    : 'Thank you. Every bill so far is marked paid.'
                  : toPay.length === 1
                    ? `${monthLabel(toPay[0].month)}, due ${longDate(dueDate(toPay[0].month))}.`
                    : `${toPay.length} months unpaid, the oldest from ${monthLabel(toPay[toPay.length - 1].month)}.`}
              </p>
              {!oneCurrency && <p className="mt-1 text-xs text-gray-400">Some months are in another currency; pay them one by one below.</p>}
              {toPay.length > 0 && (
                <ol className="mt-4 space-y-3 text-sm text-gray-700">
                  {paypalMe && oneCurrency && (
                    <li className="flex flex-wrap items-center gap-3">
                      <span className="text-gray-400">1.</span>
                      <PayButton paypalMe={paypalMe} amount={owed} currency={toPay[0].currency} label={`Pay ${formatMoney(owed, toPay[0].currency)} with PayPal`} />
                    </li>
                  )}
                  <li className="flex flex-wrap items-center gap-3">
                    {paypalMe && oneCurrency && <span className="text-gray-400">2.</span>}
                    <button type="button" onClick={() => setReporting(toPay)} className={secondaryButton}>
                      <Check className="h-4 w-4" aria-hidden />
                      I've paid
                    </button>
                    <span className="text-xs text-gray-500">with the transaction ID from PayPal</span>
                  </li>
                </ol>
              )}
              {data?.note && toPay.length > 0 && <p className="mt-3 whitespace-pre-line text-sm text-gray-600">{data.note}</p>}
            </div>
            <div className="card p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{monthLabel(latest.month)}</p>
              <p className="mt-1 text-3xl font-medium tabular-nums text-gray-900">{formatMoney(latest.supabaseAmount, latest.currency)}</p>
              <p className="mt-1 text-sm text-gray-500">
                The Supabase bill, shared by {latest.leads} lead{latest.leads === 1 ? '' : 's'}. Your share is {formatMoney(latest.amount, latest.currency)}.
              </p>
            </div>
          </div>

          <TableCard>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Month</th>
                  <th className="px-4 py-3 text-right font-semibold">Your share</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 text-right font-semibold">Paid on</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {bills.map((bill) => (
                  <tr key={bill.month}>
                    <td className="px-4 py-3 font-medium text-gray-900">{monthLabel(bill.month)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-900">{formatMoney(bill.amount, bill.currency)}</td>
                    <td className="px-4 py-3">
                      <BillStatusBadge status={billStatus(bill, today)} />
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap text-gray-600">
                      {bill.paidAt ? (
                        formatPaidOn(bill.paidAt)
                      ) : bill.reportedPaidAt ? (
                        <span title={`PayPal ${bill.reportedRef}`}>Reported {formatPaidOn(bill.reportedPaidAt)}</span>
                      ) : toPay.length > 1 ? (
                        <span className="inline-flex items-center gap-3">
                          {paypalMe && (
                            <a href={paypalLink(paypalMe, bill.amount, bill.currency)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium underline">
                              Pay
                              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                            </a>
                          )}
                          <button type="button" onClick={() => setReporting([bill])} className="font-medium underline">
                            I've paid
                          </button>
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableCard>
          <p className="mt-3 text-xs text-gray-400">After you report a payment, an admin checks PayPal and marks your share paid.</p>
        </>
      )}

      {reporting && <ReportModal bills={reporting} onClose={() => setReporting(null)} />}
    </div>
  )
}

function ReportModal({ bills, onClose }: { bills: MyBill[]; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [ref, setRef] = useState('')
  const [error, setError] = useState('')
  const total = bills.reduce((sum, bill) => sum + bill.amount, 0)
  const mutation = useMutation({
    mutationFn: async (cleaned: string) => {
      for (const bill of bills) await reportBillPaid(bill.month, cleaned)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['my-billing'] }),
    onSuccess: onClose,
    onError: (err) => setError(errorMessage(err, 'Could not report the payment. Try again.')),
  })

  function submit(e: FormEvent) {
    e.preventDefault()
    if (mutation.isPending) return
    const cleaned = paypalRef(ref)
    if (!cleaned) {
      setError('Enter the transaction ID from PayPal: letters and numbers, e.g. 5TY05013RG002845M.')
      document.getElementById('paypal-ref')?.focus()
      return
    }
    setError('')
    mutation.mutate(cleaned)
  }

  return (
    <Modal title="I've paid" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
        <p className="text-sm text-gray-600">
          {formatMoney(total, bills[0].currency)} for {bills.map((bill) => monthLabel(bill.month)).join(', ')}.
        </p>
        <div>
          <label htmlFor="paypal-ref" className="mb-1 block text-sm font-medium text-gray-700">
            PayPal transaction ID
          </label>
          <input
            id="paypal-ref"
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            placeholder="e.g. 5TY05013RG002845M"
            autoComplete="off"
            autoFocus
            aria-invalid={Boolean(error)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm uppercase outline-none focus:border-accent"
          />
          <p className="mt-1 text-xs text-gray-400">In PayPal, open Activity, tap the payment, and copy the Transaction ID.</p>
        </div>
        {error && <div className="text-sm text-status-danger-text">{error}</div>}
        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600"
          >
            <X className="h-4 w-4" aria-hidden />
            Cancel
          </button>
          <button type="submit" aria-busy={mutation.isPending} className={primaryButton}>
            <Check className="h-4 w-4" aria-hidden />
            {mutation.isPending ? 'Sending...' : 'Report payment'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
