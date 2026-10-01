import { useState, type ReactNode } from 'react'
import { Check, Copy, ExternalLink, Heart } from 'lucide-react'
import { useReveal } from '../lib/motion'
import { Logo } from '../components/Logo'

// Payment details come from the environment so they can change without a code edit
// (see .env.example). A method with nothing set shows as unavailable rather than broken.
const GCASH_NUMBER = (import.meta.env.VITE_GCASH_NUMBER as string | undefined)?.trim() || ''
const GCASH_NAME = (import.meta.env.VITE_GCASH_NAME as string | undefined)?.trim() || ''
const GCASH_QR_URL = (import.meta.env.VITE_GCASH_QR_URL as string | undefined)?.trim() || ''
// Just the PayPal.Me handle, e.g. "greyowls" for paypal.me/greyowls.
const PAYPAL_ME = (import.meta.env.VITE_PAYPAL_ME as string | undefined)?.trim().replace(/^@/, '') || ''

const CURRENCY = 'PHP'
const PRESETS = [100, 250, 500, 1000]
const MAX_AMOUNT = 1_000_000

const inputClass = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent'
const REVEAL = { selector: ':scope > *', step: 60 }

type Method = 'gcash' | 'paypal'

const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: CURRENCY, maximumFractionDigits: 2 })

// PayPal.Me takes the amount and currency in the path, e.g. paypal.me/name/500PHP,
// and opens with that amount filled in.
function paypalLink(amount: number | null): string {
  const base = `https://www.paypal.com/paypalme/${encodeURIComponent(PAYPAL_ME)}`
  return amount ? `${base}/${amount}${CURRENCY}` : base
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard can be blocked (insecure origin, permissions); the number is still on screen.
    }
  }
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={label}
      className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
    >
      {copied ? <Check size={14} className="text-status-success-text" /> : <Copy size={14} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

function Unavailable({ children }: { children: ReactNode }) {
  return (
    <div role="status" className="rounded-lg bg-status-neutral-bg px-4 py-3 text-sm text-status-neutral-text">
      {children}
    </div>
  )
}

function GcashPanel({ amount }: { amount: number | null }) {
  if (!GCASH_NUMBER && !GCASH_QR_URL) return <Unavailable>GCash donations aren't set up yet. Please use PayPal for now.</Unavailable>

  return (
    <div className="rounded-lg border border-gray-200 p-4">
      {GCASH_QR_URL && (
        <div className="mb-4 flex justify-center">
          {/* White frame in both themes: scanners need contrast around the code. */}
          <div className="rounded-lg bg-[#ffffff] p-3">
            <img src={GCASH_QR_URL} alt="GCash QR code" className="h-48 w-48 object-contain" />
          </div>
        </div>
      )}
      {GCASH_NUMBER && (
        <div className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2.5">
          <div className="min-w-0">
            {GCASH_NAME && <p className="truncate text-xs text-gray-400">{GCASH_NAME}</p>}
            <p className="font-mono text-base font-semibold tracking-wide text-gray-900">{GCASH_NUMBER}</p>
          </div>
          <CopyButton value={GCASH_NUMBER.replace(/\s/g, '')} label="Copy GCash number" />
        </div>
      )}
      <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-gray-600">
        <li>Open the GCash app and tap {GCASH_QR_URL ? <strong>Scan QR</strong> : <strong>Send Money</strong>}.</li>
        <li>
          {GCASH_QR_URL ? 'Scan the code above' : 'Enter the number above'}
          {amount ? <> and send <strong>{peso.format(amount)}</strong></> : ' and enter the amount you’d like to give'}.
        </li>
        <li>Keep the reference number from your receipt in case we need to confirm it.</li>
      </ol>
    </div>
  )
}

function PaypalPanel({ amount }: { amount: number | null }) {
  if (!PAYPAL_ME) return <Unavailable>PayPal donations aren't set up yet. Please use GCash for now.</Unavailable>

  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <p className="text-sm text-gray-600">
        You'll go to PayPal to finish{amount ? <> with <strong>{peso.format(amount)}</strong> filled in</> : ''}. You can pay with
        your PayPal balance or a card, and change the amount there if you like.
      </p>
      <a
        href={paypalLink(amount)}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-[#0070ba] px-4 py-2.5 text-sm font-semibold text-[#ffffff] hover:bg-[#005ea6]"
      >
        Donate with PayPal
        <ExternalLink size={16} />
      </a>
    </div>
  )
}

function MethodTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
        active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
      }`}
    >
      {children}
    </button>
  )
}

// Public page: anyone with the link can give, signed in or not. Nothing is recorded here;
// the money goes straight to the GCash or PayPal account configured above.
export function Donate() {
  const ref = useReveal<HTMLDivElement>(REVEAL)
  const [method, setMethod] = useState<Method>(PAYPAL_ME && !GCASH_NUMBER && !GCASH_QR_URL ? 'paypal' : 'gcash')
  const [preset, setPreset] = useState<number | null>(PRESETS[1])
  const [custom, setCustom] = useState('')

  const customValue = custom.trim() === '' ? null : Number(custom)
  const customInvalid = customValue !== null && (!Number.isFinite(customValue) || customValue <= 0 || customValue > MAX_AMOUNT)
  // Rounded to centavos so the PayPal link never carries a long float.
  const amount = customValue !== null ? (customInvalid ? null : Math.round(customValue * 100) / 100) : preset

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-10 sm:py-16">
      <div ref={ref} className="mx-auto w-full max-w-md">
        <div className="mb-8">
          <Logo />
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <Heart size={24} className="text-accent" fill="currentColor" />
            Support Grey Owls
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            Your donation helps keep the tracker running and the team growing. Every amount helps. Thank you!
          </p>

          <fieldset className="mt-6">
            <legend className="mb-2 block text-sm font-medium text-gray-700">Amount</legend>
            <div className="grid grid-cols-4 gap-2">
              {PRESETS.map((value) => {
                const selected = customValue === null && preset === value
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      setPreset(value)
                      setCustom('')
                    }}
                    className={`rounded-lg border px-2 py-2 text-sm font-semibold ${
                      selected ? 'border-accent bg-accent-bg text-accent-foreground' : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    ₱{value.toLocaleString('en-PH')}
                  </button>
                )
              })}
            </div>
            <label htmlFor="custom_amount" className="mt-3 mb-1 block text-xs text-gray-400">
              Or enter your own amount (₱)
            </label>
            <input
              id="custom_amount"
              type="number"
              inputMode="decimal"
              min={1}
              max={MAX_AMOUNT}
              step="any"
              placeholder="e.g. 750"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              aria-invalid={customInvalid}
              className={inputClass}
            />
            {customInvalid && <p className="mt-1 text-xs text-status-danger-text">Please enter an amount between ₱1 and ₱1,000,000.</p>}
          </fieldset>

          <div className="mt-6">
            <p className="mb-2 text-sm font-medium text-gray-700">Pay with</p>
            <div role="tablist" className="mb-4 flex gap-1 rounded-lg bg-gray-100 p-1">
              <MethodTab active={method === 'gcash'} onClick={() => setMethod('gcash')}>
                GCash
              </MethodTab>
              <MethodTab active={method === 'paypal'} onClick={() => setMethod('paypal')}>
                PayPal
              </MethodTab>
            </div>
            <div role="tabpanel">{method === 'gcash' ? <GcashPanel amount={amount} /> : <PaypalPanel amount={amount} />}</div>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">
          Payments are handled by GCash and PayPal. We never see your card or account details.
        </p>
      </div>
    </div>
  )
}
