import { useId } from 'react'
import { remotasksIdError } from '../lib/remotasks'

/**
 * The Remotask ID input, with the format spelled out underneath. `showError` holds the format
 * message back until the person has tried to submit, so it doesn't nag while they're still typing.
 */
export function RemotasksIdField({
  value,
  onChange,
  showError,
  hint,
  autoFocus,
}: {
  value: string
  onChange: (value: string) => void
  showError: boolean
  hint?: string
  autoFocus?: boolean
}) {
  const id = useId()
  const error = showError ? remotasksIdError(value) : null
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-gray-700">
        Remotask ID
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. 60e818c8f76af4001e9901d6"
        autoFocus={autoFocus}
        autoComplete="off"
        spellCheck={false}
        maxLength={64}
        aria-invalid={error ? true : undefined}
        className={`w-full rounded-lg border px-3 py-2 font-mono text-sm outline-none focus:border-accent ${
          error ? 'border-status-danger-text' : 'border-gray-200'
        }`}
      />
      {error ? (
        <p className="mt-1 text-xs text-status-danger-text">{error}</p>
      ) : (
        <p className="mt-1 text-xs text-gray-400">{hint ?? '24 characters: the digits 0-9 and the letters a-f.'}</p>
      )}
    </div>
  )
}
