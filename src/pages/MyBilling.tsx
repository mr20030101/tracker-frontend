import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ExternalLink, QrCode, X } from 'lucide-react'
import { FoldText } from '../components/FoldText'
import { BillStatusBadge } from '../components/BillStatusBadge'
import { TableCard } from '../components/TableToolbar'
import { Modal } from '../components/Modal'
import { errorMessage } from '../lib/api'
import { usePageTitle } from '../lib/usePageTitle'
import instapayQr from '../assets/billing/instapay-qr.svg'
import {
  DUE_DAY,
  INSTAPAY_ACCOUNT,
  billStatus,
  dueDate,
  fetchMyBilling,
  formatMoney,
  formatPaidOn,
  manilaToday,
  monthLabel,
  paymentMethodLabel,
  paypalLink,
  paypalRef,
  reportBillPaid,
  type MyBill,
  type PaymentMethod,
} from '../lib/billing'

// Billing for a lead: their own share of each month's Supabase bill. They pay through PayPal.Me
// (USD, recommended) or the admin's InstaPay QR (pesos), report it with the reference, and an admin confirms it.

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
  const [reporting, setReporting] = useState<{ bills: MyBill[]; method: PaymentMethod } | null>(null)
  const [showQr, setShowQr] = useState(false)

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
                  <li className="flex gap-3">
                    <span className="pt-2 text-gray-400">1.</span>
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-wrap items-center gap-3">
                        {paypalMe && oneCurrency && (
                          <PayButton paypalMe={paypalMe} amount={owed} currency={toPay[0].currency} label={`Pay ${formatMoney(owed, toPay[0].currency)} with PayPal`} />
                        )}
                        <button type="button" onClick={() => setShowQr(true)} className={secondaryButton}>
                          <QrCode className="h-4 w-4" aria-hidden />
                          Pay with InstaPay QR
                        </button>
                      </div>
                      <p className="text-xs text-gray-500">
                        <span className="font-semibold text-gray-700">PayPal in USD is highly recommended.</span> The server is paid in USD, so pesos lose some to conversion and fees.
                      </p>
                    </div>
                  </li>
                  <li className="flex flex-wrap items-center gap-3">
                    <span className="text-gray-400">2.</span>
                    <button type="button" onClick={() => setReporting({ bills: toPay, method: 'paypal' })} className={secondaryButton}>
                      <Check className="h-4 w-4" aria-hidden />
                      I've paid
                    </button>
                    <span className="text-xs text-gray-500">with the PayPal transaction ID or InstaPay reference</span>
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
                        <span title={`${paymentMethodLabel(bill.reportedMethod)} ${bill.reportedRef}`}>Reported {formatPaidOn(bill.reportedPaidAt)}</span>
                      ) : toPay.length > 1 ? (
                        <span className="inline-flex items-center gap-3">
                          {paypalMe && (
                            <a href={paypalLink(paypalMe, bill.amount, bill.currency)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium underline">
                              Pay
                              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                            </a>
                          )}
                          <button type="button" onClick={() => setReporting({ bills: [bill], method: 'paypal' })} className="font-medium underline">
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
          <p className="mt-3 text-xs text-gray-400">After you report a payment, an admin checks PayPal or the bank and marks your share paid.</p>
        </>
      )}

      {showQr && toPay.length > 0 && (
        <InstapayModal
          owed={formatMoney(owed, toPay[0].currency)}
          inUsd={toPay.some((bill) => bill.currency === 'USD')}
          onClose={() => setShowQr(false)}
          onPaid={() => {
            setShowQr(false)
            setReporting({ bills: toPay, method: 'instapay' })
          }}
        />
      )}
      {reporting && <ReportModal bills={reporting.bills} initialMethod={reporting.method} onClose={() => setReporting(null)} />}
    </div>
  )
}

function InstapayModal({ owed, inUsd, onClose, onPaid }: { owed: string; inUsd: boolean; onClose: () => void; onPaid: () => void }) {
  return (
    <Modal title="Pay with InstaPay" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="rounded-lg bg-status-warning-bg px-4 py-3 text-sm text-status-warning-text">
          <p className="font-semibold">PayPal in USD is highly recommended</p>
          <p className="mt-0.5">The Tracker's server is paid in USD. Use InstaPay only if you can't use PayPal.</p>
        </div>
        <div className="mx-auto w-full max-w-64 rounded-lg border border-gray-200 bg-white p-3">
          <img src={instapayQr} alt="InstaPay QR code for the Grey Owls Tracker bill" className="block aspect-square w-full" />
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-gray-500">Name</dt>
          <dd className="font-medium text-gray-900">{INSTAPAY_ACCOUNT.name}</dd>
          <dt className="text-gray-500">Bank</dt>
          <dd className="text-gray-900">
            {INSTAPAY_ACCOUNT.bank} <span className="font-mono text-gray-500">•••• {INSTAPAY_ACCOUNT.last4}</span>
          </dd>
          <dt className="text-gray-500">Amount</dt>
          <dd className="tabular-nums text-gray-900">{owed}</dd>
        </dl>
        <p className="text-xs text-gray-500">
          Scan with GCash, Maya or any bank app.{' '}
          {inUsd ? 'Send the peso equivalent at today\'s rate, and cover any transfer fee.' : 'Cover any transfer fee so the full amount arrives.'}
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={secondaryButton}>
            Close
          </button>
          <button type="button" onClick={onPaid} className={primaryButton}>
            <Check className="h-4 w-4" aria-hidden />
            I've paid
          </button>
        </div>
      </div>
    </Modal>
  )
}

function ReportModal({ bills, initialMethod, onClose }: { bills: MyBill[]; initialMethod: PaymentMethod; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [method, setMethod] = useState<PaymentMethod>(initialMethod)
  const [ref, setRef] = useState('')
  const [error, setError] = useState('')
  const total = bills.reduce((sum, bill) => sum + bill.amount, 0)
  const mutation = useMutation({
    mutationFn: async (cleaned: string) => {
      for (const bill of bills) await reportBillPaid(bill.month, cleaned, method)
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
      setError(
        method === 'instapay'
          ? 'Enter the InstaPay reference number from your bank app: letters and numbers.'
          : 'Enter the transaction ID from PayPal: letters and numbers, e.g. 5TY05013RG002845M.',
      )
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
        <fieldset>
          <legend className="mb-1 text-sm font-medium text-gray-700">Paid with</legend>
          <div className="grid grid-cols-2 gap-2">
            {(['paypal', 'instapay'] as const).map((option) => (
              <label
                key={option}
                className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 has-[:checked]:border-accent has-[:checked]:font-medium has-[:checked]:text-gray-900"
              >
                <input type="radio" name="pay-method" value={option} checked={method === option} onChange={() => setMethod(option)} className="accent-accent" />
                {paymentMethodLabel(option)}
                {option === 'paypal' && <span className="text-xs font-normal text-gray-400">USD</span>}
              </label>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor="paypal-ref" className="mb-1 block text-sm font-medium text-gray-700">
            {method === 'instapay' ? 'InstaPay reference number' : 'PayPal transaction ID'}
          </label>
          <input
            id="paypal-ref"
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            placeholder={method === 'instapay' ? 'e.g. 123456789012' : 'e.g. 5TY05013RG002845M'}
            autoComplete="off"
            autoFocus
            aria-invalid={Boolean(error)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-sm uppercase outline-none focus:border-accent"
          />
          <p className="mt-1 text-xs text-gray-400">
            {method === 'instapay'
              ? 'In your bank or e-wallet app, open the transfer receipt and copy the reference number.'
              : 'In PayPal, open Activity, tap the payment, and copy the Transaction ID.'}
          </p>
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
