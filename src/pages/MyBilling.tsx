import { useQuery } from '@tanstack/react-query'
import { FoldText } from '../components/FoldText'
import { BillStatusBadge } from '../components/BillStatusBadge'
import { TableCard } from '../components/TableToolbar'
import { errorMessage } from '../lib/api'
import { usePageTitle } from '../lib/usePageTitle'
import { ExternalLink } from 'lucide-react'
import { DUE_DAY, billStatus, dueDate, fetchMyBilling, formatMoney, formatPaidOn, manilaToday, monthLabel, paypalLink, type MyBill } from '../lib/billing'

// Billing for a lead: their own share of each month's Supabase bill, and whether it's been marked paid.

function longDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
}

function PayButton({ paypalMe, amount, currency, label }: { paypalMe: string; amount: number; currency: MyBill['currency']; label: string }) {
  return (
    <a
      href={paypalLink(paypalMe, amount, currency)}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
    >
      {label}
      <ExternalLink className="h-4 w-4" aria-hidden />
    </a>
  )
}

export function MyBilling() {
  usePageTitle('Billing')
  const today = manilaToday()
  const { data, isLoading, error } = useQuery({ queryKey: ['my-billing'], queryFn: fetchMyBilling, staleTime: 60_000 })

  const bills = data?.bills ?? []
  const unpaid = bills.filter((bill) => !bill.paidAt)
  const owed = unpaid.reduce((sum, bill) => sum + bill.amount, 0)
  const latest = bills[0]
  const paypalMe = data?.paypalMe ?? null
  const oneCurrency = unpaid.every((bill) => bill.currency === unpaid[0]?.currency)

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
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{unpaid.length > 0 ? 'To pay' : 'All paid'}</p>
              <p className="mt-1 text-3xl font-medium tabular-nums text-gray-900">
                {formatMoney(owed, unpaid[0]?.currency ?? latest.currency)}
              </p>
              <p className="mt-1 text-sm text-gray-500">
                {unpaid.length === 0
                  ? 'Thank you. Every bill so far is marked paid.'
                  : unpaid.length === 1
                    ? `${monthLabel(unpaid[0].month)}, due ${longDate(dueDate(unpaid[0].month))}.`
                    : `${unpaid.length} months unpaid, the oldest from ${monthLabel(unpaid[unpaid.length - 1].month)}.`}
              </p>
              {!oneCurrency && <p className="mt-1 text-xs text-gray-400">Some months are in another currency; pay them one by one below.</p>}
              {paypalMe && unpaid.length > 0 && oneCurrency && (
                <div className="mt-4">
                  <PayButton paypalMe={paypalMe} amount={owed} currency={unpaid[0].currency} label={`Pay ${formatMoney(owed, unpaid[0].currency)} with PayPal`} />
                </div>
              )}
              {data?.note && unpaid.length > 0 && <p className="mt-3 whitespace-pre-line text-sm text-gray-600">{data.note}</p>}
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
                      ) : paypalMe && unpaid.length > 1 ? (
                        <a href={paypalLink(paypalMe, bill.amount, bill.currency)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium underline">
                          Pay this month
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableCard>
          <p className="mt-3 text-xs text-gray-400">
            Paying doesn't update this page by itself: an admin marks your share paid once they've received it.
          </p>
        </>
      )}
    </div>
  )
}
