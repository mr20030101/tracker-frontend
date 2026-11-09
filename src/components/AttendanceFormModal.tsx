import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, Pencil, RotateCcw, Save, Send, Trash2, X } from 'lucide-react'
import { errorMessage } from '../lib/api'
import {
  CONTRIBUTOR_HOURS,
  HOURS_LABELS,
  SUPPORT_HOURS,
  TASKING,
  TASKING_STATUSES,
  attendanceTimeLabel,
  attendanceWindow,
  deleteAttendance,
  fileAttendance,
} from '../lib/attendance'
import { useAttendanceClosesMin } from '../lib/useAttendanceClosesMin'
import { useNow } from '../lib/useNow'
import { confirmDialog } from '../lib/dialog'
import { fetchAttendancePhotoRequired, sendAttendanceToGoogleForm, uploadAttendancePhoto } from '../lib/attendancePhoto'
import { CameraCapture } from './CameraCapture'
import { fromISODate, todayIso } from '../lib/week'
import { Modal } from './Modal'
import { Select } from './Select'
import type { Attendance, AttendanceHours } from '../types'

const inputClass = 'rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent'

type Step = 'photo' | 'hours' | 'status' | 'review'
const STEP_LABELS: Record<Step, string> = { photo: 'Photo', hours: 'Hours', status: 'Status', review: 'Review' }

/**
 * Files (or changes) one person's attendance for one day, one step at a time: photo, hours, status,
 * then a review before it's sent. `support` is a lead or admin filing for someone on their team: no
 * photo step, the support-only hours options and a Delete button.
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
  // Admins choose whether a contributor's own entry needs a photo. Until the setting loads the form
  // treats it as optional; file_attendance() enforces the real setting either way.
  const { data: photoRequired = false } = useQuery({
    queryKey: ['attendance-photo-required'],
    queryFn: fetchAttendancePhotoRequired,
    staleTime: 60_000,
  })
  // A contributor filing their own sees the camera until there's a photo; one that has a photo keeps
  // it unless they retake it.
  const hasPhoto = Boolean(existing?.photo_ref)
  const [retaking, setRetaking] = useState(false)
  const showCamera = !support && (!hasPhoto || retaking)
  // When the photo is required, filing for the first time means taking one before saving. Retaking
  // can always fall back to "Keep current photo".
  const waitingForPhoto = photoRequired && showCamera && !photo

  // A contributor's own form shuts as soon as the window does, even if it was opened before, so
  // they're told now instead of when file_attendance() refuses the save.
  const now = useNow(1000)
  const { closesMin } = useAttendanceClosesMin()
  const closed = !support && (date !== todayIso(now) || attendanceWindow(new Date(now), closesMin) !== 'open')
  const closedMessage = `Attendance closed at ${attendanceTimeLabel(closesMin)}. Ask your lead to file it for you.`

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

  const steps: Step[] = support ? ['hours', 'status', 'review'] : ['photo', 'hours', 'status', 'review']
  const [stepIndex, setStepIndex] = useState(0)
  const step = steps[stepIndex]
  const isLast = stepIndex === steps.length - 1

  const photoUrl = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo])
  useEffect(() => () => {
    if (photoUrl) URL.revokeObjectURL(photoUrl)
  }, [photoUrl])

  // Why a step can't be left yet, or null when it's complete.
  function stepProblem(s: Step): string | null {
    if (s === 'photo' && waitingForPhoto) return retaking ? 'Take your new photo, or keep the current one.' : 'Take a photo with your camera first.'
    if (s === 'hours' && !hours) return 'Pick how many hours you can commit today.'
    if (s === 'status') {
      if (!status) return 'Pick a tasking status.'
      if (tasking && !taskId.trim()) return 'Add the Task ID, or N/A.'
      if (tasking && !screenshotUrl.trim()) return 'Add the screenshot link, or N/A.'
    }
    return null
  }

  function goTo(index: number) {
    setFormError(null)
    setStepIndex(index)
  }

  function next() {
    const problem = stepProblem(step)
    if (problem) return setFormError(problem)
    goTo(stepIndex + 1)
  }

  const busy = saveMutation.isPending || deleteMutation.isPending
  const mutationError = saveMutation.error ?? deleteMutation.error

  return (
    <Modal title={existing ? 'Edit attendance' : 'Attendance'} onClose={onClose} maxWidthClassName="max-w-lg">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!isLast) return next()
          if (busy) return
          if (!support && (date !== todayIso(Date.now()) || attendanceWindow(new Date(), closesMin) !== 'open')) return setFormError(closedMessage)
          const blocked = steps.findIndex((s) => stepProblem(s))
          if (blocked !== -1) {
            setStepIndex(blocked)
            return setFormError(stepProblem(steps[blocked]))
          }
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

        <nav aria-label="Attendance steps">
          <ol className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
            {steps.map((s, i) => {
              const done = i < stepIndex
              const current = i === stepIndex
              return (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => done && goTo(i)}
                    aria-current={current ? 'step' : undefined}
                    className={`flex w-full flex-col gap-1.5 text-left text-xs pointer-coarse:min-h-11 ${done ? 'cursor-pointer' : 'cursor-default'}`}
                  >
                    <span className={`h-1 w-full rounded-full ${done || current ? 'bg-accent' : 'bg-gray-200'}`} />
                    <span className={current ? 'font-semibold text-gray-900' : done ? 'text-gray-700 hover:underline' : 'text-gray-400'}>
                      {i + 1}. {STEP_LABELS[s]}
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        </nav>

        {step === 'photo' && (
          <div className="flex flex-col gap-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium text-gray-700">
                Take your photo{!photoRequired && <span className="font-normal text-gray-500"> (optional)</span>}
              </span>
              {hasPhoto && !retaking && (
                <button type="button" onClick={() => setRetaking(true)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700 hover:underline pointer-coarse:min-h-11">
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden />
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
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:underline pointer-coarse:min-h-11"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                  Keep current photo
                </button>
              )}
            </div>
            {photo && photoUrl ? (
              <div className="flex flex-col gap-2">
                <img src={photoUrl} alt="Your photo" className="w-full rounded-lg object-cover" />
                <button
                  type="button"
                  onClick={() => setPhoto(null)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  <RotateCcw className="h-4 w-4" aria-hidden />
                  Take it again
                </button>
              </div>
            ) : showCamera ? (
              <CameraCapture onChange={setPhoto} />
            ) : (
              <p className="text-xs text-gray-500">You took a photo when you filed today. It stays unless you retake it.</p>
            )}
          </div>
        )}

        {step === 'hours' && (
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
                    onChange={() => {
                      setHours(option)
                      setFormError(null)
                    }}
                    className="accent-accent"
                  />
                  {HOURS_LABELS[option]}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {step === 'status' && (
          <>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-gray-700">Tasking status</span>
              <Select
                fullWidth
                value={status}
                onChange={(value) => {
                  setStatus(value)
                  setFormError(null)
                }}
                options={statusOptions}
                placeholder="Choose a status..."
                aria-label="Tasking status"
                className={inputClass}
              />
            </label>
            {!support && !existing && <p className="text-xs text-gray-500">Please pick your tasking status carefully. You can change it until the window closes.</p>}
            {tasking && (
              <>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-gray-700">Task ID</span>
                  <input
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
                    value={screenshotUrl}
                    onChange={(e) => setScreenshotUrl(e.target.value)}
                    maxLength={1000}
                    placeholder="https://snipboard.io/..., or N/A"
                    className={inputClass}
                  />
                </label>
              </>
            )}
          </>
        )}

        {step === 'review' && (
          <div className="flex flex-col gap-3 text-sm">
            <p className="text-gray-600">Check your answers, then {existing ? 'save' : 'submit'}. One entry a day.</p>
            <div className="flex flex-col gap-4 rounded-lg bg-gray-50 p-3 sm:flex-row">
              {!support && (
                <button
                  type="button"
                  onClick={() => goTo(steps.indexOf('photo'))}
                  aria-label="Change photo"
                  className="group relative shrink-0 self-start overflow-hidden rounded-md sm:w-36"
                >
                  {photoUrl ? (
                    <img src={photoUrl} alt="Your photo" className="aspect-4/3 w-full object-cover sm:aspect-square" />
                  ) : (
                    <span className="flex aspect-4/3 w-full items-center justify-center bg-gray-100 px-3 text-center text-xs text-gray-500 sm:aspect-square">
                      {hasPhoto ? 'Keeping today’s photo' : 'No photo'}
                    </span>
                  )}
                  <span className="absolute bottom-1.5 right-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-gray-700">
                    <Pencil className="h-3.5 w-3.5" aria-hidden />
                  </span>
                </button>
              )}
              <div className="flex min-w-0 flex-1 flex-col divide-y divide-gray-200">
                {[
                  { label: 'Hours', to: 'hours' as Step, value: hours ? HOURS_LABELS[hours] : '—' },
                  { label: 'Tasking status', to: 'status' as Step, value: status || '—' },
                  ...(tasking
                    ? [
                        {
                          label: 'Task',
                          to: 'status' as Step,
                          value: (
                            <span className="flex flex-col gap-0.5">
                              <span className="truncate font-mono text-xs">{taskId}</span>
                              <span className="break-all text-xs text-gray-600">{screenshotUrl}</span>
                            </span>
                          ),
                        },
                      ]
                    : []),
                ].map((row) => (
                  <button
                    key={row.label}
                    type="button"
                    onClick={() => goTo(steps.indexOf(row.to))}
                    aria-label={`Change ${row.label.toLowerCase()}`}
                    className="flex items-start justify-between gap-3 py-2 text-left first:pt-0 last:pb-0 pointer-coarse:min-h-11"
                  >
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-xs text-gray-500">{row.label}</span>
                      <span className="font-medium text-gray-900">{row.value}</span>
                    </span>
                    <Pencil className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {closed ? (
          <div className="rounded-lg border border-status-danger-text/30 bg-status-danger-bg px-3 py-2 text-sm font-medium text-status-danger-text">{closedMessage}</div>
        ) : (
          (formError || mutationError) && (
            <div role="alert" className="text-sm text-status-danger-text">
              {formError ?? errorMessage(mutationError, 'Could not save the attendance.')}
            </div>
          )
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
              className="mr-auto inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              Delete
            </button>
          )}
          {stepIndex === 0 ? (
            <button type="button" onClick={onClose} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600">
              <X className="h-4 w-4" aria-hidden />
              Cancel
            </button>
          ) : (
            <button
              type="button"
              onClick={() => goTo(stepIndex - 1)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Back
            </button>
          )}
          {isLast ? (
            <button
              type="submit"
              aria-busy={saveMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
            >
              {existing ? <Save className="h-4 w-4" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
              {saveMutation.isPending ? (photo ? 'Saving photo...' : 'Saving...') : existing ? 'Save changes' : 'Submit attendance'}
            </button>
          ) : (
            <button type="submit" className="inline-flex items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground">
              Next
              <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>
      </form>
    </Modal>
  )
}
