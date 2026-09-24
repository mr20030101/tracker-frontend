import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type InputHTMLAttributes, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { animate, type JSAnimation } from 'animejs'
import {
  describeIssues,
  fetchApplicationLead,
  normalizeProfileUrl,
  requirementIssues,
  submitApplication,
  type ApplicationInput,
} from '../lib/hiring'
import { prefersReducedMotion, useReveal } from '../lib/motion'
import { Logo } from '../components/Logo'
import { RobotStage } from '../components/robots/RobotStage'
import { RobotEmoji } from '../components/RobotEmoji'

const inputClass = 'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-accent'
// Same staggered entrance as the login card: everything above the form, then each field in turn.
const REVEAL = { selector: ':scope > :not(form), :scope > form > *', step: 60 }

type YesNo = '' | 'yes' | 'no'

const emptyForm = {
  // Step 1: personal information
  remotasks_email: '',
  remotasks_id: '',
  full_name: '',
  active_email: '',
  facebook_url: '',
  robotics: '' as YesNo,
  // Step 2: the applicant's computer
  personal_computer: '' as YesNo,
  stable_internet: '' as YesNo,
  cpu: '',
  gpu: '',
  gpu_memory_gb: '',
}

type FormState = typeof emptyForm
type SetField = (field: keyof FormState) => (e: { target: { value: string } }) => void

const STEP_TITLES = ['Personal information', 'Your computer']

// The photo eases in from a closer, fainter frame once it has loaded, then
// drifts very slowly so the panel stays alive. The entrance runs on the wrapper
// and the drift on the <img>, so the two never fight over one transform. The
// image is scaled past 100% throughout (drift travel stays inside the extra
// 3-6%), so the panel's overflow-hidden edge never shows a gap.
function ApplyPhoto() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)

  useLayoutEffect(() => {
    const wrap = wrapRef.current
    const img = imgRef.current
    if (!wrap || !img || prefersReducedMotion()) return

    let animations: JSAnimation[] = []
    let cancelled = false
    // Hidden before first paint, and until the file is in, so it never fades in empty.
    wrap.style.opacity = '0'
    const start = () => {
      if (cancelled) return
      animations = [
        animate(wrap, { opacity: [0, 1], scale: [1.12, 1], duration: 1400, ease: 'outCubic' }),
        animate(img, {
          scale: [1.06, 1.12],
          translateX: ['0%', '-1.5%'],
          translateY: ['0%', '1.5%'],
          duration: 22_000,
          ease: 'inOutSine',
          alternate: true,
          loop: true,
        }),
      ]
    }
    if (img.complete) start()
    else img.addEventListener('load', start, { once: true })

    return () => {
      cancelled = true
      img.removeEventListener('load', start)
      animations.forEach((animation) => animation.revert())
      wrap.style.opacity = ''
    }
  }, [])

  return (
    <div ref={wrapRef} className="absolute inset-0">
      {/* Photo from Pexels (free to use, no attribution required). Decorative, so no alt text. */}
      <img
        ref={imgRef}
        src="/images/apply-robot.jpg"
        alt=""
        className="h-full w-full object-cover object-[50%_15%] will-change-transform lg:object-[50%_35%]"
      />
    </div>
  )
}

// Rises in line by line once the photo has settled.
function Pitch() {
  const ref = useReveal<HTMLDivElement>({ selector: ':scope > p', delay: 700, step: 140 })
  return (
    <div ref={ref} className="absolute inset-x-0 bottom-0 hidden p-10 text-[#ffffff] lg:block">
      <p className="text-3xl font-bold leading-tight">Join the team.</p>
      <p className="mt-2 max-w-sm text-sm text-[#ffffff]/85">
        Answer a few quick questions and your lead will review your application.
      </p>
    </div>
  )
}

// Photo on the left, content on the right. On a phone the photo becomes a
// banner above the content. The pitch over the photo only shows while the form
// is open. Text on the photo uses an explicit hex rather than
// text-white because the dark theme remaps --color-white to a dark colour.
function ApplyShell({ pitch, children }: { pitch: boolean; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white lg:grid lg:grid-cols-[5fr_6fr]">
      <div className="relative h-44 overflow-hidden sm:h-60 lg:sticky lg:top-0 lg:h-screen">
        <ApplyPhoto />
        <div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/10 to-transparent" />
        {pitch && <Pitch />}
      </div>
      <div className="flex flex-col justify-center px-6 py-10 sm:px-12 lg:min-h-screen">
        <RobotStage />
        {/* Above the robot walking behind it. */}
        <div className="relative z-10 mx-auto w-full max-w-md">
          <div className="mb-8">
            <Logo />
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}

function StepIndicator({ step }: { step: 1 | 2 }) {
  return (
    <div className="mt-3 mb-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
        Step {step} of {STEP_TITLES.length} · {STEP_TITLES[step - 1]}
      </p>
      <div className="mt-2 flex gap-2" aria-hidden="true">
        {STEP_TITLES.map((title, i) => (
          <div key={title} className={`h-1.5 flex-1 rounded-full ${i < step ? 'bg-accent' : 'bg-gray-200'}`} />
        ))}
      </div>
    </div>
  )
}

function Field({
  id,
  label,
  hint,
  optional = false,
  ...input
}: { id: string; label: string; hint?: string; optional?: boolean } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-gray-700">
        {label}
        {optional && <span className="font-normal text-gray-400"> (optional)</span>}
      </label>
      <input id={id} required={!optional} className={inputClass} {...input} />
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  )
}

function YesNoField({
  legend,
  name,
  value,
  onChange,
}: {
  legend: string
  name: string
  value: YesNo
  onChange: (e: { target: { value: string } }) => void
}) {
  return (
    <fieldset>
      <legend className="mb-1 block text-sm font-medium text-gray-700">{legend}</legend>
      <div className="flex gap-5">
        {(['yes', 'no'] as const).map((answer) => (
          <label key={answer} className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="radio"
              name={name}
              required
              value={answer}
              checked={value === answer}
              onChange={onChange}
              className="h-4 w-4 border-gray-300 text-accent focus:ring-accent"
            />
            {answer === 'yes' ? 'Yes' : 'No'}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function FormError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div role="alert" className="text-sm text-status-danger-text">
      {message}
    </div>
  )
}

function PersonalStep({
  form,
  set,
  error,
  onNext,
}: {
  form: FormState
  set: SetField
  error: string | null
  onNext: (e: FormEvent) => void
}) {
  const ref = useReveal<HTMLDivElement>(REVEAL)
  return (
    <div ref={ref}>
      <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
        Robotics Project Application
        <RobotEmoji page="apply" />
      </h1>
      <StepIndicator step={1} />
      <form onSubmit={onNext} className="flex flex-col gap-4">
        <Field id="remotasks_email" label="Remotasks Email" type="email" maxLength={254} value={form.remotasks_email} onChange={set('remotasks_email')} />
        <Field id="remotasks_id" label="Remotasks ID" maxLength={200} value={form.remotasks_id} onChange={set('remotasks_id')} />
        <Field id="full_name" label="Full Name" maxLength={200} value={form.full_name} onChange={set('full_name')} />
        <Field id="active_email" label="Active Email" type="email" maxLength={254} value={form.active_email} onChange={set('active_email')} />
        <Field
          id="facebook_url"
          label="Facebook Profile Link"
          hint="Used to add you to the group chat. Please do not put N/A."
          placeholder="https://facebook.com/your.profile"
          maxLength={500}
          value={form.facebook_url}
          onChange={set('facebook_url')}
        />
        <YesNoField legend="Do you have a background working on Robotics?" name="robotics" value={form.robotics} onChange={set('robotics')} />
        <FormError message={error} />
        <button type="submit" className="mt-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground">
          Next
        </button>
      </form>
    </div>
  )
}

// The optional processor and graphics questions only appear when the applicant
// says they have a personal computer. They rise in one after another, like the
// rest of the form.
function ComputerDetails({ form, set }: { form: FormState; set: SetField }) {
  const ref = useReveal<HTMLDivElement>({ step: 60 })
  return (
    <div ref={ref} className="flex flex-col gap-4">
      <Field
        id="cpu"
        label="Processor (CPU)"
        optional
        placeholder="e.g. Ryzen 5 3600 or Intel Core i5-10400"
        maxLength={200}
        value={form.cpu}
        onChange={set('cpu')}
      />
      <Field
        id="gpu"
        label="Graphics card (GPU)"
        optional
        placeholder="e.g. NVIDIA GTX 1650"
        maxLength={200}
        value={form.gpu}
        onChange={set('gpu')}
      />
      <Field
        id="gpu_memory_gb"
        label="GPU memory (GB)"
        optional
        hint="Enter 0 if you have no dedicated GPU."
        type="number"
        min={0}
        max={256}
        step="any"
        inputMode="decimal"
        placeholder="4"
        value={form.gpu_memory_gb}
        onChange={set('gpu_memory_gb')}
      />
    </div>
  )
}

function ComputerStep({
  form,
  set,
  error,
  pending,
  onBack,
  onSubmit,
}: {
  form: FormState
  set: SetField
  error: string | null
  pending: boolean
  onBack: () => void
  onSubmit: (e: FormEvent) => void
}) {
  const ref = useReveal<HTMLDivElement>(REVEAL)
  const hasComputer = form.personal_computer === 'yes'
  // A heads-up only: the lead decides, and the CPU is free text that can't be checked here.
  // GPU memory only counts while its field is showing.
  const issues = requirementIssues({
    has_personal_computer: form.personal_computer ? hasComputer : null,
    has_stable_internet: form.stable_internet ? form.stable_internet === 'yes' : null,
    gpu_memory_gb: hasComputer && form.gpu_memory_gb.trim() !== '' ? Number(form.gpu_memory_gb) : null,
  })

  return (
    <div ref={ref}>
      <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
        Robotics Project Application
        <RobotEmoji page="apply" />
      </h1>
      <StepIndicator step={2} />
      <div className="mb-5 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-400">Requirements</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Must have a personal computer and a stable internet connection</li>
          <li>Minimum specs: Ryzen 3 / Intel i5 with at least 4GB GPU</li>
        </ul>
      </div>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <YesNoField legend="Do you have a personal computer?" name="personal_computer" value={form.personal_computer} onChange={set('personal_computer')} />
        <YesNoField legend="Do you have a stable internet connection?" name="stable_internet" value={form.stable_internet} onChange={set('stable_internet')} />
        {hasComputer && <ComputerDetails form={form} set={set} />}
        {issues.length > 0 && (
          <div role="status" className="rounded-lg bg-status-warning-bg px-3 py-2 text-sm text-status-warning-text">
            Your answers are below the requirements ({describeIssues(issues)}). You can still submit, but your lead may not be
            able to accept your application.
          </div>
        )}
        <FormError message={error} />
        <div className="mt-2 flex gap-3">
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Back
          </button>
          <button
            type="submit"
            disabled={pending}
            className="flex-1 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground disabled:opacity-50"
          >
            {pending ? 'Submitting...' : 'Submit application'}
          </button>
        </div>
      </form>
    </div>
  )
}

function Submitted({ name }: { name: string }) {
  const ref = useReveal<HTMLDivElement>(REVEAL)
  return (
    <div ref={ref} role="status">
      <h1 className="text-2xl font-bold text-gray-900">Application submitted</h1>
      <p className="mt-2 text-sm text-gray-500">
        Thanks, {name}. Your lead will review your application and be in touch through the active email you gave.
      </p>
    </div>
  )
}

function ApplicationForm({ leadId }: { leadId: string }) {
  const [step, setStep] = useState<1 | 2>(1)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState<string | null>(null)

  const submitMutation = useMutation({
    mutationFn: (input: ApplicationInput) => submitApplication(leadId, input),
    onError: (mutationError: Error) => setError(mutationError.message || 'Could not submit your application.'),
  })

  // Each step is taller than the viewport on a phone; start it from the top.
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [step])

  const set: SetField = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }))

  const facebookError = 'Please enter a link to your Facebook profile. "N/A" is not accepted.'

  function handleNext(e: FormEvent) {
    e.preventDefault()
    if (!normalizeProfileUrl(form.facebook_url)) {
      setError(facebookError)
      return
    }
    setError(null)
    setStep(2)
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const facebookUrl = normalizeProfileUrl(form.facebook_url)
    if (!facebookUrl) {
      setError(facebookError)
      setStep(1)
      return
    }
    // CPU, GPU and GPU memory are optional, and only asked of someone with a computer:
    // a blank answer, or anything typed before switching to No, is sent as null.
    const hasComputer = form.personal_computer === 'yes'
    const gpuMemory = hasComputer && form.gpu_memory_gb.trim() !== '' ? Number(form.gpu_memory_gb) : null
    if (gpuMemory !== null && !Number.isFinite(gpuMemory)) {
      setError('Please enter your GPU memory in GB.')
      return
    }
    setError(null)
    submitMutation.mutate({
      remotasks_email: form.remotasks_email,
      remotasks_id: form.remotasks_id,
      full_name: form.full_name,
      active_email: form.active_email,
      facebook_url: facebookUrl,
      has_robotics_background: form.robotics === 'yes',
      has_personal_computer: hasComputer,
      has_stable_internet: form.stable_internet === 'yes',
      cpu: (hasComputer && form.cpu.trim()) || null,
      gpu: (hasComputer && form.gpu.trim()) || null,
      gpu_memory_gb: gpuMemory,
    })
  }

  if (submitMutation.isSuccess) return <Submitted name={form.full_name.trim()} />

  if (step === 1) return <PersonalStep form={form} set={set} error={error} onNext={handleNext} />

  return (
    <ComputerStep
      form={form}
      set={set}
      error={error}
      pending={submitMutation.isPending}
      onBack={() => {
        setError(null)
        setStep(1)
      }}
      onSubmit={handleSubmit}
    />
  )
}

// Public page a lead shares with applicants: no sign-in, so it talks to the
// database only through the hiring RPCs (see supabase/schema.sql).
export function Apply() {
  const { leadId = '' } = useParams()

  const { data: lead, isLoading, error: leadError } = useQuery({
    queryKey: ['application-lead', leadId],
    queryFn: () => fetchApplicationLead(leadId),
    retry: false,
  })

  let content
  if (isLoading) {
    content = <p className="text-sm text-gray-400">Loading...</p>
  } else if (leadError) {
    content = (
      <div role="alert" className="text-sm text-status-danger-text">
        Could not load this application form. Please try again later.
      </div>
    )
  } else if (!lead) {
    content = (
      <>
        <h1 className="text-2xl font-bold text-gray-900">Link not valid</h1>
        <p className="mt-2 text-sm text-gray-500">
          This application link isn't active. Ask the person who sent it for a new one.
        </p>
      </>
    )
  } else if (!lead.accepting) {
    content = (
      <>
        <h1 className="text-2xl font-bold text-gray-900">Applications are closed</h1>
        <p className="mt-2 text-sm text-gray-500">
          {lead.name} isn't accepting applications right now. Please check back later or ask them directly.
        </p>
      </>
    )
  } else {
    content = <ApplicationForm leadId={leadId} />
  }

  return <ApplyShell pitch={Boolean(lead?.accepting)}>{content}</ApplyShell>
}
