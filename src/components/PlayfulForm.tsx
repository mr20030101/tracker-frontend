import type { InputHTMLAttributes, ReactNode } from 'react'
import { Eye, EyeOff, type LucideIcon } from 'lucide-react'

// Form pieces shared by the playful pages (login, application form): rounded inputs with an icon,
// the chunky gold button, and soft error/success notes.

export function PlayfulInput({
  id,
  label,
  icon: Icon,
  trailing,
  hint,
  highlightHint = false,
  optional = false,
  invalid = false,
  ...input
}: {
  id: string
  label: string
  icon: LucideIcon
  trailing?: ReactNode
  hint?: string
  /** Shows the hint as a yellow callout rather than small grey text. */
  highlightHint?: boolean
  /** Adds "(optional)" to the label and leaves the field not required. */
  optional?: boolean
  /** Red border, for a value the form rejected. */
  invalid?: boolean
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-gray-700">
        {label}
        {optional && <span className="font-normal text-gray-400"> (optional)</span>}
      </label>
      <div className="group relative">
        <Icon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 transition-colors group-focus-within:text-accent" />
        <input
          id={id}
          className={`w-full rounded-xl border-2 bg-gray-50 py-2.5 pl-10 pr-10 text-sm outline-none transition-all placeholder:text-gray-400 focus:bg-white ${
            invalid
              ? 'border-status-danger-text focus:border-status-danger-text focus:shadow-[0_0_0_4px_rgba(220,38,38,0.15)]'
              : 'border-gray-200 focus:border-accent focus:shadow-[0_0_0_4px_rgba(212,160,23,0.15)]'
          }`}
          aria-invalid={invalid || undefined}
          {...(optional ? {} : { required: true })}
          {...input}
        />
        {trailing && <div className="absolute right-2 top-1/2 -translate-y-1/2">{trailing}</div>}
      </div>
      {hint &&
        (highlightHint ? (
          <p className="mt-2 rounded-xl bg-status-warning-bg px-3 py-2 text-xs font-medium text-status-warning-text">{hint}</p>
        ) : (
          <p className="mt-1.5 text-xs text-gray-400">{hint}</p>
        ))}
    </div>
  )
}

/** A Yes/No question as two chunky toggle pills (radio inputs underneath). The form checks it's answered. */
export function YesNoPills({
  legend,
  name,
  value,
  onChange,
}: {
  legend: string
  name: string
  value: '' | 'yes' | 'no'
  onChange: (e: { target: { value: string } }) => void
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 block text-sm font-medium text-gray-700">{legend}</legend>
      <div className="grid grid-cols-2 gap-2">
        {(['yes', 'no'] as const).map((answer) => (
          <label key={answer} className="relative cursor-pointer">
            {/* Visually hidden but still focusable. */}
            <input
              type="radio"
              name={name}
              value={answer}
              checked={value === answer}
              onChange={onChange}
              className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
            <span className="flex items-center justify-center rounded-xl border-2 border-gray-200 bg-gray-50 py-2.5 text-sm font-semibold text-gray-600 transition-all peer-checked:border-accent peer-checked:bg-accent-bg peer-checked:text-accent-foreground peer-focus-visible:shadow-[0_0_0_4px_rgba(212,160,23,0.25)] peer-hover:border-gray-300">
              {answer === 'yes' ? 'Yes' : 'No'}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export function RevealToggle({ shown, onToggle }: { shown: boolean; onToggle: () => void }) {
  const Icon = shown ? EyeOff : Eye
  return (
    <button
      type="button"
      // Keep focus in the password field, so the owl stays in peek/cover mode while toggling.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onToggle}
      aria-label={shown ? 'Hide password' : 'Show password'}
      aria-pressed={shown}
      className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
    >
      <Icon className="h-4 w-4" />
    </button>
  )
}

export function SubmitButton({ pending, label, pendingLabel }: { pending: boolean; label: string; pendingLabel: string }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-1 rounded-xl bg-accent px-4 py-3 text-sm font-bold text-accent-foreground shadow-[0_4px_0_0_#a87c0c] transition-all hover:-translate-y-0.5 hover:shadow-[0_6px_0_0_#a87c0c] active:translate-y-1 active:shadow-[0_0_0_0_#a87c0c] disabled:translate-y-0 disabled:opacity-60 disabled:shadow-[0_4px_0_0_#a87c0c]"
    >
      {pending ? pendingLabel : label}
    </button>
  )
}

export function LinkButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="text-sm font-medium text-sky-700 hover:underline">
      {children}
    </button>
  )
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-xl bg-status-danger-bg px-3 py-2 text-sm text-status-danger-text">
      {message}
    </div>
  )
}

export function SuccessNote({ message }: { message: string }) {
  return (
    <div role="status" className="rounded-xl bg-status-success-bg px-3 py-2 text-sm text-status-success-text">
      {message}
    </div>
  )
}

/** An on/off switch with its label; a checkbox underneath, so keyboard and screen readers work as usual. */
export function PlayfulSwitch({
  id,
  label,
  checked,
  onChange,
}: {
  id: string
  label: ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border-2 border-gray-200 bg-gray-50 px-3.5 py-2.5">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <span className="relative inline-flex shrink-0">
        <input id={id} type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
        <span className="h-6 w-11 rounded-full bg-gray-300 transition-colors peer-checked:bg-accent peer-focus-visible:shadow-[0_0_0_4px_rgba(212,160,23,0.25)]" />
        <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-[#ffffff] shadow transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  )
}
