import { Shuffle } from 'lucide-react'
import type { OfficeAvatar } from '../../lib/office'
import { AVATAR_FIELDS, avatarOptions, kit, toSavedAvatar } from './kit'

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`

// The side panel for designing your Office character. Every change goes straight to `onChange`, and
// the page shows it on your character in the scene as a live preview; nothing is saved until Save.
export function AvatarBuilder({
  userId,
  draft,
  onChange,
  onSave,
  onCancel,
  saving,
  error,
}: {
  userId: string
  // Your picks so far; anything missing still shows as your current look.
  draft: OfficeAvatar
  onChange: (draft: OfficeAvatar) => void
  onSave: (avatar: OfficeAvatar) => void
  onCancel: () => void
  saving: boolean
  error: string | null
}) {
  const current = toSavedAvatar(avatarOptions(userId, draft))

  return (
    <aside className="flex max-h-[70vh] w-full shrink-0 flex-col rounded-xl lg:max-h-none lg:w-72 border border-gray-200 bg-white">
      <div className="border-b border-gray-200 p-4">
        <h2 className="text-sm font-bold text-gray-900">Your avatar</h2>
        <p className="text-xs text-gray-500">Changes show on your character right away. Everyone sees it once you save.</p>
      </div>

      <div className="flex-1 space-y-3.5 overflow-y-auto p-4">
        {AVATAR_FIELDS.map((field) => {
          const labelId = `avatar-${field.key}`
          return (
            <div key={field.key}>
              <div id={labelId} className="mb-1.5 text-xs font-bold text-gray-700">
                {field.label}
              </div>
              <div role="group" aria-labelledby={labelId} className="flex flex-wrap gap-1.5">
                {field.values.map((value) => {
                  const selected = current[field.key] === value
                  const pick = () => onChange({ ...current, [field.key]: value })
                  if ('color' in field && typeof value === 'number') {
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={pick}
                        aria-pressed={selected}
                        aria-label={`${field.label} ${hex(value)}`}
                        className={`h-7 w-7 rounded-full border border-gray-300 ${selected ? 'ring-2 ring-accent ring-offset-2 ring-offset-white' : ''}`}
                        style={{ background: hex(value) }}
                      />
                    )
                  }
                  return (
                    <button
                      key={String(value)}
                      type="button"
                      onClick={pick}
                      aria-pressed={selected}
                      className={`rounded-lg border px-2.5 py-1 text-xs font-semibold capitalize ${
                        selected ? 'border-accent bg-accent text-accent-foreground' : 'border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      {typeof value === 'boolean' ? (value ? 'Yes' : 'No') : value}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      <div className="space-y-2 border-t border-gray-200 p-3">
        {error && <p className="text-xs text-status-danger-text">{error}</p>}
        <button
          type="button"
          onClick={() => onChange(toSavedAvatar(kit.randomPersonOptions(Math.floor(Math.random() * 1e9))))}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-gray-200 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100"
        >
          <Shuffle className="h-3.5 w-3.5" /> Randomize
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="flex-1 rounded-lg border border-gray-200 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave(current)}
            disabled={saving}
            className="flex-1 rounded-lg bg-accent py-1.5 text-sm font-semibold text-accent-foreground disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </aside>
  )
}
