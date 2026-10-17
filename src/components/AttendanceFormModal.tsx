import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { errorMessage } from '../lib/api'
import {
  CONTRIBUTOR_HOURS,
  HOURS_LABELS,
  SUPPORT_HOURS,
  TASKING,
  TASKING_STATUSES,
  deleteAttendance,
  fileAttendance,
} from '../lib/attendance'
import { confirmDialog } from '../lib/dialog'
import { sendAttendanceToGoogleForm, uploadAttendancePhoto } from '../lib/attendancePhoto'
import { CameraCapture } from './CameraCapture'
import { fromISODate } from '../lib/week'
import { Modal } from './Modal'
import { Select } from './Select'
import type { Attendance, AttendanceHours } from '../types'

const inputClass = 'rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent'

/**
 * Files (or changes) one person's attendance for one day. `support` is a lead or admin filing for
 * someone on their team: it adds the support-only hours options and a Delete button.
 */
export function AttendanceFormModal({
  person,
  date,
  existing,
  support = false,
  onClose,
}: {
  person: { id: string; name: string; email: string }
  date: string
  existing: Attendance | null
  support?: boolean
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [hours, setHours] = useState<AttendanceHours | ''>(existing?.hours ?? '')
  const [status, setStatus] = useState(existing?.tasking_status ?? '')
  const [taskId, setTaskId] = useState(existing?.task_id ?? '')
  const [screenshotUrl, setScreenshotUrl] = useState(existing?.screenshot_url ?? '')
  const [formError, setFormError] = useState<string | null>(null)
  const [photo, setPhoto] = useState<Blob | null>(null)
  // A contributor filing their own sees the camera until there's a photo; one that has a photo keeps
  // it unless they retake it. The photo isn't required: they can submit without one.
  const hasPhoto = Boolean(existing?.photo_ref)
  const [retaking, setRetaking] = useState(false)
  const showCamera = !support && (!hasPhoto || retaking)

  const hoursOptions = support ? [...CONTRIBUTOR_HOURS, ...SUPPORT_HOURS] : CONTRIBUTOR_HOURS
  const statusOptions = TASKING_STATUSES.map((s) => ({ value: s, label: s }))
  // An entry saved with a status that's since left the list keeps it as an option.
  if (status && !TASKING_STATUSES.includes(status)) statusOptions.push({ value: status, label: status })
  const tasking = status === TASKING
  const dayLabel = fromISODate(date).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Singapore',
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['attendance'] })

  const saveMutation = useMutation({
    mutationFn: async () => {
      const photoRef = photo ? await uploadAttendancePhoto(photo) : null
      await fileAttendance({
        userId: person.id,
        date,
        hours: hours as AttendanceHours,
        taskingStatus: status,
        taskId: tasking ? taskId : '',
        screenshotUrl: tasking ? screenshotUrl : '',
        photoRef,
      })
      // Saved either way; a failed send is recorded on the entry and can be retried from its card.
      await sendAttendanceToGoogleForm(person.id, date).catch(() => {})
    },
    onSuccess: () => {
      invalidate()
      onClose()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteAttendance(existing!.id),
    onSuccess: () => {
      invalidate()
      onClose()
    },
  })

  const busy = saveMutation.isPending || deleteMutation.isPending
  const mutationError = saveMutation.error ?? deleteMutation.error

  return (
    <Modal title={existing ? 'Edit attendance' : 'Attendance'} onClose={onClose} maxWidthClassName="max-w-lg">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!hours) return setFormError('Pick how many hours you can commit today.')
          if (!status) return setFormError('Pick a tasking status.')
          setFormError(null)
          saveMutation.mutate()
        }}
        className="flex flex-col gap-4"
      >
        <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm">
          <div className="font-medium text-gray-900">{person.name}</div>
          <div className="text-xs text-gray-500">
            {person.email} · {dayLabel}
          </div>
        </div>

        {!support && !existing && (
          <p className="text-xs text-gray-500">
            One entry a day. Please pick your tasking status carefully. You can change it until the window closes.
          </p>
        )}

        {!support && (
          <div className="flex flex-col gap-1 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium text-gray-700">Your photo</span>
              {hasPhoto && !retaking && (
                <button type="button" onClick={() => setRetaking(true)} className="text-xs font-semibold text-sky-700 hover:underline">
                  Retake photo
                </button>
              )}
              {retaking && (
                <button
                  type="button"
                  onClick={() => {
                    setRetaking(false)
                    setPhoto(null)
                  }}
                  className="text-xs font-semibold text-gray-500 hover:underline"
                >
                  Keep current photo
                </button>
              )}
            </div>
            {showCamera ? (
              <CameraCapture onChange={setPhoto} />
            ) : (
              <p className="text-xs text-gray-500">You took a photo when you filed today. It stays unless you retake it.</p>
            )}
          </div>
        )}

        <fieldset className="flex flex-col gap-2 text-sm">
          <legend className="mb-1 font-medium text-gray-700">
            {support ? 'Hours committed today' : 'For today’s production, how many hours can we expect you to commit?'}
          </legend>
          <div className="grid grid-cols-2 gap-2">
            {hoursOptions.map((option) => (
              <label
                key={option}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 ${
                  hours === option ? 'border-accent bg-accent-bg' : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <input
                  type="radio"
                  name="attendance-hours"
                  value={option}
                  checked={hours === option}
                  onChange={() => setHours(option)}
                  className="accent-accent"
                />
                {HOURS_LABELS[option]}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-gray-700">Tasking status</span>
          <Select
            fullWidth
            value={status}
            onChange={setStatus}
            options={statusOptions}
            placeholder="Choose a status..."
            aria-label="Tasking status"
            className={inputClass}
          />
        </label>

        {tasking && (
          <>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-gray-700">Task ID</span>
              <input
                required
                value={taskId}
                onChange={(e) => setTaskId(e.target.value)}
                maxLength={200}
                placeholder="e.g. 6aa34905fe8d09b156e1ef4d, or N/A"
                className={`${inputClass} font-mono`}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-gray-700">Screenshot link of your progress</span>
              <input
                required
                value={screenshotUrl}
                onChange={(e) => setScreenshotUrl(e.target.value)}
                maxLength={1000}
                placeholder="https://snipboard.io/..., or N/A"
                className={inputClass}
              />
            </label>
          </>
        )}

        {(formError || mutationError) && (
          <div className="text-sm text-status-danger-text">{formError ?? errorMessage(mutationError, 'Could not save the attendance.')}</div>
        )}

        <div className="mt-1 flex flex-wrap items-center justify-end gap-2">
          {support && existing && (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                if (await confirmDialog(`Delete ${person.name}'s attendance for this day?`, { confirmLabel: 'Delete', danger: true })) {
                  deleteMutation.mutate()
                }
              }}
              className="mr-auto rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              Delete
            </button>
          )}
          <button type="button" onClick={onClose} className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600">
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
          >
            {saveMutation.isPending ? (photo ? 'Saving photo...' : 'Saving...') : existing ? 'Save changes' : 'Submit attendance'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
