import { useState, type ReactNode } from 'react'
import { Check, Copy, Download, ExternalLink, Heart } from 'lucide-react'
import { useReveal } from '../lib/motion'
import { Logo } from '../components/Logo'

// Payment details come from the environment so they can change without a code edit
// (see .env.example). A method with nothing set shows as unavailable rather than broken.
const GCASH_NUMBER = (import.meta.env.VITE_GCASH_NUMBER as string | undefined)?.trim() || ''
const GCASH_NAME = (import.meta.env.VITE_GCASH_NAME as string | undefined)?.trim() || ''
// QR codes in public/images/donate: a light and a dark design, each cropped to just the code for
// the page, plus the full poster (with the account name) for donors to save.
const GCASH_QR = {
  day: { shown: '/images/donate/gcash-qr-day.png', full: '/images/donate/gcash-qr-day-full.png' },
  night: { shown: '/images/donate/gcash-qr-night.png', full: '/images/donate/gcash-qr-night-full.png' },
}
// Just the PayPal.Me handle, e.g. "greyowls" for paypal.me/greyowls.
const PAYPAL_ME = (import.meta.env.VITE_PAYPAL_ME as string | undefined)?.trim().replace(/^@/, '') || ''

type Method = 'gcash' | 'paypal'

// GCash only moves pesos; PayPal donors give in US dollars.
const CURRENCIES = {
  gcash: { code: 'PHP', symbol: '₱', presets: [10, 25, 50, 100], defaultPreset: 10, min: 10, max: 100, example: '30' },
  paypal: { code: 'USD', symbol: '$', presets: [1, 3, 4, 5], defaultPreset: 1, min: 1, max: 5, example: '2' },
} as const

const formatters = {
  gcash: new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 2 }),
  paypal: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }),
}

const inputClass = 'w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-accent'
const REVEAL = { selector: ':scope > *', step: 60 }

// PayPal.Me takes the amount and currency in the path, e.g. paypal.me/name/10USD,
// and opens with that amount filled in.
function paypalLink(amount: number | null): string {
  const base = `https://www.paypal.com/paypalme/${encodeURIComponent(PAYPAL_ME)}`
  return amount ? `${base}/${amount}${CURRENCIES.paypal.code}` : base
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
  return (
    <div className="rounded-lg border border-gray-200 p-4">
      {/* Day design on the light theme, Night on the dark one, swapped like the logo (index.css). */}
      {(['day', 'night'] as const).map((variant) => (
        <div key={variant} className={`mb-4 ${variant === 'day' ? 'logo-on-light' : 'logo-on-dark'}`}>
          <div className="flex flex-col items-center gap-2">
            {/* White in both themes, with room around the code: scanners need a clear margin. */}
            <div className="w-full max-w-64 rounded-xl border border-gray-200 bg-[#ffffff] p-4">
              <img src={GCASH_QR[variant].shown} alt="GCash QR code" className="h-auto w-full" />
            </div>
            {/* A donor on their phone can't scan their own screen; GCash can read a saved QR from the gallery. */}
            <a
              href={GCASH_QR[variant].full}
              download="gcash-qr.png"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 hover:underline"
            >
              <Download size={14} />
              Save QR image
            </a>
          </div>
        </div>
      ))}
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
        <li>
          Open GCash (or any InstaPay bank or e-wallet) and tap <strong>Scan QR</strong>. On your phone, save the QR and
          choose <strong>Upload QR</strong>.
        </li>
        <li>
          Scan the code
          {amount ? <> and send <strong>{formatters.gcash.format(amount)}</strong></> : ' and enter the amount you’d like to give'}.
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
        You'll go to PayPal to finish{amount ? <> with <strong>{formatters.paypal.format(amount)}</strong> filled in</> : ''}. You can pay with
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
  const [method, setMethod] = useState<Method>('gcash')
  const [preset, setPreset] = useState<number | null>(CURRENCIES[method].defaultPreset)
  const [custom, setCustom] = useState('')
  const currency = CURRENCIES[method]

  // ₱10 and $10 are very different gifts, so switching method starts the amount over.
  function chooseMethod(next: Method) {
    if (next === method) return
    setMethod(next)
    setPreset(CURRENCIES[next].defaultPreset)
    setCustom('')
  }

  const customValue = custom.trim() === '' ? null : Number(custom)
  const customInvalid = customValue !== null && (!Number.isFinite(customValue) || customValue < currency.min || customValue > currency.max)
  // Rounded to two decimals so the PayPal link never carries a long float.
  const amount = customValue !== null ? (customInvalid ? null : Math.round(customValue * 100) / 100) : preset

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-10 sm:py-16">
      <div ref={ref} className="mx-auto w-full max-w-md md:max-w-4xl">
        <div className="mb-8">
          <Logo />
        </div>

        {/* Choices on the left, how to pay on the right; one column on a phone. */}
        <div className="grid gap-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8 md:grid-cols-2 md:gap-10">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
              <Heart size={24} className="text-accent" fill="currentColor" />
              Support the developer
            </h1>
            <p className="mt-2 text-sm text-gray-500">
              Your donation goes directly to the developer who builds and maintains this tracker, and helps keep new features
              and fixes coming. Every amount helps. Thank you!
            </p>

            <div className="mt-6">
              <p className="mb-2 text-sm font-medium text-gray-700">Pay with</p>
              <div role="tablist" className="flex gap-1 rounded-lg bg-gray-100 p-1">
                <MethodTab active={method === 'gcash'} onClick={() => chooseMethod('gcash')}>
                  GCash <span className="font-normal text-gray-400">(₱ PHP)</span>
                </MethodTab>
                <MethodTab active={method === 'paypal'} onClick={() => chooseMethod('paypal')}>
                  PayPal <span className="font-normal text-gray-400">($ USD)</span>
                </MethodTab>
              </div>
            </div>

            <fieldset className="mt-6">
              <legend className="mb-2 block text-sm font-medium text-gray-700">Amount</legend>
              <div className="grid grid-cols-4 gap-2">
                {currency.presets.map((value) => {
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
                      {currency.symbol}{value.toLocaleString('en-US')}
                    </button>
                  )
                })}
              </div>
              <label htmlFor="custom_amount" className="mt-3 mb-1 block text-xs text-gray-400">
                Or enter your own amount ({currency.symbol} {currency.code})
              </label>
              <input
                id="custom_amount"
                type="number"
                inputMode="decimal"
                min={currency.min}
                max={currency.max}
                step="any"
                placeholder={`e.g. ${currency.example}`}
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                aria-invalid={customInvalid}
                className={inputClass}
              />
              {customInvalid && <p className="mt-1 text-xs text-status-danger-text">Please enter an amount between {formatters[method].format(currency.min)} and {formatters[method].format(currency.max)}.</p>}
            </fieldset>
          </div>

          <div role="tabpanel" className="md:self-start">
            {method === 'gcash' ? <GcashPanel amount={amount} /> : <PaypalPanel amount={amount} />}
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">
          Payments are handled by GCash and PayPal. We never see your card or account details.
        </p>
      </div>
    </div>
  )
}
