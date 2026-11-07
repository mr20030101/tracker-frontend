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
        <Icon className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 transition-colors group-focus-within:text-gray-900" />
        <input
          id={id}
          className={`h-12 w-full rounded-full border bg-gray-50 pl-11 pr-11 text-sm outline-none transition-colors duration-150 placeholder:text-gray-400 focus:bg-white ${
            invalid ? 'border-status-danger-text' : 'border-gray-200 focus:border-gray-900'
          }`}
          aria-invalid={invalid || undefined}
          {...(optional ? {} : { required: true })}
          {...input}
        />
        {trailing && <div className="absolute right-1.5 top-1/2 -translate-y-1/2">{trailing}</div>}
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
            <span className="flex items-center justify-center h-12 rounded-full border border-gray-200 bg-gray-50 text-sm font-semibold text-gray-600 transition-colors duration-150 peer-checked:border-ink peer-checked:bg-ink peer-checked:text-ink-foreground peer-focus-visible:shadow-[0_0_0_4px_rgba(212,160,23,0.25)] peer-hover:border-gray-300">
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
      className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-900 pointer-coarse:h-11 pointer-coarse:w-11"
    >
      <Icon className="h-4 w-4" />
    </button>
  )
}

export function SubmitButton({
  pending,
  label,
  pendingLabel,
  icon: Icon,
}: {
  pending: boolean
  label: string
  pendingLabel: string
  icon?: LucideIcon
}) {
  return (
    <button
      type="submit"
      aria-busy={pending}
      onClick={(e) => pending && e.preventDefault()}
      className="mt-2 inline-flex h-12 items-center justify-center gap-1.5 rounded-full bg-accent px-5 text-sm font-semibold text-accent-foreground transition-colors duration-150 hover:bg-accent-bg"
    >
      {Icon && <Icon className="h-4 w-4" aria-hidden />}
      {pending ? pendingLabel : label}
    </button>
  )
}

export function LinkButton({ onClick, children, icon: Icon }: { onClick: () => void; children: ReactNode; icon?: LucideIcon }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1.5 text-sm font-medium text-sky-700 hover:underline">
      {Icon && <Icon className="h-4 w-4" aria-hidden />}
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
    <label htmlFor={id} className="flex min-h-12 cursor-pointer items-center justify-between gap-3 rounded-full border border-gray-200 bg-gray-50 px-5 py-2">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <span className="relative inline-flex shrink-0">
        <input id={id} type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
        <span className="h-6 w-11 rounded-full bg-gray-300 transition-colors peer-checked:bg-accent peer-focus-visible:ring-4 peer-focus-visible:ring-accent/30" />
        <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  )
}
