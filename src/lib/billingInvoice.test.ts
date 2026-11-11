import { describe, expect, it } from 'vitest'
import { invoiceMonth, invoiceNote, invoicePath, parseInvoiceText } from './billingInvoice'

// The text pdf.js reads from a real Supabase invoice (address lines shortened).
const SUPABASE_INVOICE =
  'INVOICE  Supabase Pte. Ltd. 65 Chulia Street Singapore  Bill to:  A Customer Philippines Invoice number   INXSHY-00006 ' +
  'Invoice date   Nov 9, 2026 Due date   Nov 9, 2026  Amount due   $28.00  Description   Quantity   Rate   Amount  Pro Plan  ' +
  'Nov 9 – Dec 8, 2026  1   $25.00   $25.00 Memo: Prices are exclusive of applicable taxes.  Subtotal   $25.00 GST (12%)   $3.00  ' +
  'Amount due   $28.00  1 of 1'

describe('parseInvoiceText', () => {
  it('reads a Supabase invoice', () => {
    expect(parseInvoiceText(SUPABASE_INVOICE)).toEqual({
      amount: 28,
      currency: 'USD',
      invoiceNumber: 'INXSHY-00006',
      invoiceDate: 'Nov 9, 2026',
      period: 'Nov 9 – Dec 8, 2026',
    })
  })

  it('reads thousands and pesos', () => {
    const details = parseInvoiceText('Amount due ₱1,450.50')
    expect(details.amount).toBe(1450.5)
    expect(details.currency).toBe('PHP')
  })

  it('leaves out what it cannot find', () => {
    expect(parseInvoiceText('Some other PDF')).toEqual({ amount: null, currency: null, invoiceNumber: null, invoiceDate: null, period: null })
  })
})

describe('invoice helpers', () => {
  it('finds the month of the invoice date', () => {
    expect(invoiceMonth('Nov 9, 2026')).toBe('2026-11-01')
    expect(invoiceMonth('not a date')).toBeNull()
  })

  it('writes a note', () => {
    expect(invoiceNote(parseInvoiceText(SUPABASE_INVOICE))).toBe('Invoice INXSHY-00006 · Nov 9 – Dec 8, 2026')
  })

  it('names the file safely under the month', () => {
    expect(invoicePath('2026-11-01', 'INXSHY-00006')).toBe('2026-11/INXSHY-00006.pdf')
    expect(invoicePath('2026-11-01', '../../x y')).toBe('2026-11/xy.pdf')
    expect(invoicePath('2026-11-01', null)).toMatch(/^2026-11\/invoice-\d+\.pdf$/)
  })
})
