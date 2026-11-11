import { supabase } from './api'
import type { BillingCurrency } from './billing'

// Supabase invoice PDFs on the Billing page: read in the browser to fill in the month's bill, and
// kept in the private billing-invoices bucket (admins only; 20261111_lead_billing.sql).

const BUCKET = 'billing-invoices'
export const INVOICE_MAX_BYTES = 5 * 1024 * 1024

export interface InvoiceDetails {
  amount: number | null
  currency: BillingCurrency | null
  invoiceNumber: string | null
  invoiceDate: string | null
  period: string | null
}

/** What an invoice says, from its text: the amount due, currency, number, date and billing period. */
export function parseInvoiceText(text: string): InvoiceDetails {
  const flat = text.replace(/\s+/g, ' ')
  const due = flat.match(/Amount due\s*(US\$|\$|₱|PHP|USD)?\s*([\d,]+\.\d{2})/i)
  const symbol = due?.[1]?.toUpperCase()
  const currency: BillingCurrency | null = !due ? null : symbol === '₱' || symbol === 'PHP' ? 'PHP' : 'USD'
  const period = flat.match(/([A-Z][a-z]{2} \d{1,2} [–-] [A-Z][a-z]{2} \d{1,2}, \d{4})/)
  return {
    amount: due ? Number(due[2].replace(/,/g, '')) : null,
    currency,
    invoiceNumber: flat.match(/Invoice number\s*([A-Z0-9][A-Z0-9-]{2,40})/i)?.[1] ?? null,
    invoiceDate: flat.match(/Invoice date\s*([A-Z][a-z]{2,8} \d{1,2}, \d{4})/)?.[1] ?? null,
    period: period?.[1].replace(' - ', ' – ') ?? null,
  }
}

/** The month (first day, YYYY-MM-DD) an invoice date like "Nov 9, 2026" falls in. */
export function invoiceMonth(invoiceDate: string): string | null {
  const date = new Date(`${invoiceDate} 00:00:00`)
  if (Number.isNaN(date.getTime())) return null
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`
}

/** A short note for the month from an invoice. */
export function invoiceNote(details: InvoiceDetails): string {
  return [details.invoiceNumber && `Invoice ${details.invoiceNumber}`, details.period].filter(Boolean).join(' · ')
}

/** Reads a PDF's text in the browser. pdf.js is loaded only when an invoice is picked. */
export async function readInvoicePdf(file: File): Promise<InvoiceDetails> {
  const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')])
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise
  try {
    const parts: string[] = []
    for (let n = 1; n <= Math.min(doc.numPages, 3); n++) {
      const content = await (await doc.getPage(n)).getTextContent()
      for (const item of content.items) if ('str' in item) parts.push(item.str)
    }
    return parseInvoiceText(parts.join(' '))
  } finally {
    await doc.destroy()
  }
}

/** The file's name in the bucket: under the month's folder, named after the invoice number when there is one. */
export function invoicePath(month: string, invoiceNumber: string | null): string {
  const name = (invoiceNumber ?? '').replace(/[^A-Za-z0-9._-]/g, '').replace(/^\.+/, '').slice(0, 60) || `invoice-${Date.now()}`
  return `${month.slice(0, 7)}/${name}.pdf`
}

export async function uploadInvoice(path: string, file: File): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: 'application/pdf', upsert: true })
  if (error) throw error
}

/** A link to the stored invoice that works for one minute. */
export async function invoiceUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60)
  if (error) throw error
  return data.signedUrl
}
