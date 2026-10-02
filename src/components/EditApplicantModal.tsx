import { useState, type FormEvent, type ReactNode } from 'react'
import { useMutation } from '@tanstack/react-query'
import { normalizeProfileUrl, normalizeRemotasksId, updateApplication, type ApplicationEdit } from '../lib/hiring'
import type { HiringApplication } from '../types'
import { Modal } from './Modal'

// Correcting an applicant's details (a mistyped email, Remotasks ID or Facebook link). The
// database applies the same checks as the public form and records the change in the audit log.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type YesNo = '' | 'yes' | 'no'
const toYesNo = (value: boolean | null): YesNo => (value === null ? '' : value ? 'yes' : 'no')
const fromYesNo = (value: YesNo): boolean | null => (value === '' ? null : value === 'yes')

const inputClass = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent'

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-gray-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-gray-400">{hint}</span>}
    </label>
  )
}

function YesNoSelect({ value, onChange, allowBlank }: { value: YesNo; onChange: (value: YesNo) => void; allowBlank: boolean }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as YesNo)} className={inputClass}>
      {allowBlank && <option value="">Not answered</option>}
      <option value="yes">Yes</option>
      <option value="no">No</option>
    </select>
  )
}

export function EditApplicantModal({
  application,
  onClose,
  onSaved,
}: {
  application: HiringApplication
  onClose: () => void
  onSaved: (updated: HiringApplication) => void
}) {
  const [form, setForm] = useState({
    full_name: application.full_name,
    active_email: application.active_email,
    remotasks_email: application.remotasks_email ?? '',
    remotasks_id: application.remotasks_id ?? '',
    facebook_url: application.facebook_url,
    has_robotics_background: toYesNo(application.has_robotics_background),
    has_personal_computer: toYesNo(application.has_personal_computer),
    has_stable_internet: toYesNo(application.has_stable_internet),
    cpu: application.cpu ?? '',
    gpu: application.gpu ?? '',
    gpu_memory_gb: application.gpu_memory_gb === null ? '' : String(Number(application.gpu_memory_gb)),
  })
  const [error, setError] = useState<string | null>(null)
  const set = (field: keyof typeof form) => (value: string) => setForm((current) => ({ ...current, [field]: value }))

  const save = useMutation({
    mutationFn: (edit: ApplicationEdit) => updateApplication(application.id, edit),
    onSuccess: (_, edit) =>
      onSaved({
        ...application,
        ...edit,
        active_email: edit.active_email.trim().toLowerCase(),
        remotasks_email: edit.remotasks_email.trim().toLowerCase() || null,
        remotasks_id: edit.remotasks_id.trim() || null,
        cpu: edit.cpu.trim() || null,
        gpu: edit.gpu.trim() || null,
      }),
    onError: (err) => setError(err instanceof Error ? err.message : 'Could not save these details.'),
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    const facebookUrl = normalizeProfileUrl(form.facebook_url)
    const gpuMemory = form.gpu_memory_gb.trim() === '' ? null : Number(form.gpu_memory_gb)
    const problem = !form.full_name.trim()
      ? 'Name is required.'
      : !EMAIL_PATTERN.test(form.active_email.trim())
        ? 'Please enter a valid active email.'
        : form.remotasks_email.trim() && !EMAIL_PATTERN.test(form.remotasks_email.trim())
          ? 'Please enter a valid Remotasks email, or leave it blank.'
          : !facebookUrl
            ? 'Please enter a link to their Facebook profile.'
            : form.has_robotics_background === ''
              ? 'Please answer the robotics question.'
              : gpuMemory !== null && (!Number.isFinite(gpuMemory) || gpuMemory < 0 || gpuMemory > 256)
                ? 'GPU memory must be between 0 and 256 GB.'
                : null
    if (problem) {
      setError(problem)
      return
    }

    save.mutate({
      full_name: form.full_name.trim(),
      active_email: form.active_email.trim(),
      remotasks_email: form.remotasks_email.trim(),
      remotasks_id: form.remotasks_id.trim(),
      facebook_url: facebookUrl!,
      has_robotics_background: form.has_robotics_background === 'yes',
      has_personal_computer: fromYesNo(form.has_personal_computer),
      has_stable_internet: fromYesNo(form.has_stable_internet),
      cpu: form.cpu.trim(),
      gpu: form.gpu.trim(),
      gpu_memory_gb: gpuMemory,
    })
  }

  // Not a blocker — old applications carry IDs in other shapes — just a nudge to double-check.
  const idLooksWrong = form.remotasks_id.trim() !== '' && !normalizeRemotasksId(form.remotasks_id)

  return (
    <Modal title={`Edit ${application.full_name}`} onClose={onClose} maxWidthClassName="max-w-2xl">
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        {application.user_id && (
          <p className="rounded-lg bg-status-warning-bg px-3 py-2 text-sm text-status-warning-text">
            Their account is already created. Changing an email here doesn't change the email they sign in with.
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Full name">
            <input value={form.full_name} onChange={(e) => set('full_name')(e.target.value)} maxLength={200} className={inputClass} />
          </Field>
          <Field label="Active email">
            <input type="email" value={form.active_email} onChange={(e) => set('active_email')(e.target.value)} maxLength={254} className={inputClass} />
          </Field>
          <Field label="Remotasks email" hint="Their login when their account is created. Blank if they have none.">
            <input type="email" value={form.remotasks_email} onChange={(e) => set('remotasks_email')(e.target.value)} maxLength={254} className={inputClass} />
          </Field>
          <Field
            label="Remotasks ID"
            hint={idLooksWrong ? 'This doesn’t look like a Remotasks ID (24 characters, 0–9 and a–f). Double-check it.' : undefined}
          >
            <input value={form.remotasks_id} onChange={(e) => set('remotasks_id')(e.target.value)} maxLength={200} className={inputClass} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Facebook profile link">
              <input value={form.facebook_url} onChange={(e) => set('facebook_url')(e.target.value)} maxLength={500} className={inputClass} />
            </Field>
          </div>
          <Field label="Robotics background">
            <YesNoSelect value={form.has_robotics_background} onChange={set('has_robotics_background')} allowBlank={false} />
          </Field>
          <Field label="Personal computer">
            <YesNoSelect value={form.has_personal_computer} onChange={set('has_personal_computer')} allowBlank />
          </Field>
          <Field label="Stable internet">
            <YesNoSelect value={form.has_stable_internet} onChange={set('has_stable_internet')} allowBlank />
          </Field>
          <Field label="GPU memory (GB)">
            <input
              type="number"
              min={0}
              max={256}
              step="any"
              inputMode="decimal"
              value={form.gpu_memory_gb}
              onChange={(e) => set('gpu_memory_gb')(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Processor (CPU)">
            <input value={form.cpu} onChange={(e) => set('cpu')(e.target.value)} maxLength={200} className={inputClass} />
          </Field>
          <Field label="Graphics card (GPU)">
            <input value={form.gpu} onChange={(e) => set('gpu')(e.target.value)} maxLength={200} className={inputClass} />
          </Field>
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-status-danger-bg px-3 py-2 text-sm text-status-danger-text">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600">
            Cancel
          </button>
          <button
            type="submit"
            disabled={save.isPending}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
          >
            {save.isPending ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
