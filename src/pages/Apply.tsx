import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { CircuitBoard, Cpu, IdCard, Link as LinkIcon, Mail, MailCheck, MemoryStick, User, X } from 'lucide-react'
import {
  describeIssues,
  fetchApplicationLead,
  normalizeProfileUrl,
  normalizeRemotasksId,
  requirementIssues,
  submitApplication,
  type ApplicationInput,
} from '../lib/hiring'
import { useReveal } from '../lib/motion'
import { fetchVisitorCountry } from '../lib/geo'
import { CardHeading, PerchedCard } from '../components/PerchedCard'
import { ErrorNote, PlayfulInput, SubmitButton, YesNoPills } from '../components/PlayfulForm'
import { usePageTitle } from '../lib/usePageTitle'

// Same staggered entrance as the login card: everything above the form, then each field in turn.
const REVEAL = { selector: ':scope > :not(form), :scope > form > *', step: 60 }

type YesNo = '' | 'yes' | 'no'

const emptyForm = {
  // Step 1: personal information. A Remotasks account is required, so applicants without one sign up first.
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

// Where applicants without a Remotasks account sign up before applying.
const REMOTASKS_SIGNUP_URL = 'https://www.remotasks.com/en'

const FACEBOOK_ERROR = 'Please enter a link to your Facebook profile. "N/A" is not accepted.'
const REMOTASKS_ID_ERROR = 'Invalid Remotasks ID. It should be 24 characters, using only numbers 0-9 and letters a-f.'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// True when the Remotasks details are all that's left blank on step 1, so the sign-up note is highlighted.
function onlyRemotasksMissing(form: FormState): boolean {
  const remotasksMissing = !form.remotasks_email.trim() || !form.remotasks_id.trim()
  const restFilled = Boolean(form.full_name.trim() && form.active_email.trim() && form.facebook_url.trim() && form.robotics)
  return remotasksMissing && restFilled
}

// The forms skip the browser's own checks (noValidate); these return one alert per problem
// (empty when the step is fine), each shown on its own.
function personalStepErrors(form: FormState): string[] {
  const errors: string[] = []
  const filled = (value: string, label: string) => {
    if (!value.trim()) errors.push(`${label} is required.`)
    return Boolean(value.trim())
  }
  filled(form.full_name, 'Full Name')
  if (filled(form.active_email, 'Active Email') && !EMAIL_PATTERN.test(form.active_email.trim())) {
    errors.push('Please enter a valid Active Email.')
  }
  if (filled(form.facebook_url, 'Facebook Profile Link') && !normalizeProfileUrl(form.facebook_url)) {
    errors.push(FACEBOOK_ERROR)
  }
  if (!form.robotics) errors.push('Please answer whether you have a background working on Robotics.')
  const emailFilled = filled(form.remotasks_email, 'Remotasks Email')
  if (emailFilled && !EMAIL_PATTERN.test(form.remotasks_email.trim())) errors.push('Please enter a valid Remotasks Email.')
  const idFilled = filled(form.remotasks_id, 'Remotasks ID')
  if (idFilled && !normalizeRemotasksId(form.remotasks_id)) errors.push(REMOTASKS_ID_ERROR)
  if (!emailFilled || !idFilled) errors.push("A Remotasks account is required, so create one first if you don't have one.")
  return errors
}

function computerStepErrors(form: FormState): string[] {
  const errors: string[] = []
  if (!form.personal_computer) errors.push('Please answer whether you have a personal computer.')
  if (!form.stable_internet) errors.push('Please answer whether you have a stable internet connection.')
  if (form.personal_computer === 'yes' && form.gpu_memory_gb.trim() !== '') {
    const gpuMemory = Number(form.gpu_memory_gb)
    if (!Number.isFinite(gpuMemory) || gpuMemory < 0 || gpuMemory > 256) errors.push('Please enter your GPU memory in GB (0 to 256).')
  }
  return errors
}

// Applications are open to people in the Philippines only (checked by IP address, see api/country.ts).
const ELIGIBLE_COUNTRY = 'PH'

function StepIndicator({ step }: { step: 1 | 2 }) {
  return (
    <div className="mb-6">
      <p className="text-center text-xs font-semibold uppercase tracking-wider text-gray-400">
        Step {step} of {STEP_TITLES.length} · {STEP_TITLES[step - 1]}
      </p>
      <div className="mt-2 flex gap-2" aria-hidden="true">
        {STEP_TITLES.map((title, i) => (
          <div key={title} className={`h-2 flex-1 rounded-full ${i < step ? 'bg-accent' : 'bg-gray-200'}`} />
        ))}
      </div>
    </div>
  )
}

// The forms are a two-column grid from tablet width up (one column on phones); these span both columns.
const FULL_ROW = 'md:col-span-2'

// The errors float at the top right of the page (across the top on phones), one alert per problem,
// so they're seen without scrolling. A new failed attempt (nudge) brings back any that were closed.
function FormErrors({ errors, nudge }: { errors: string[]; nudge: number }) {
  if (errors.length === 0) return null
  return createPortal(
    <div className="fixed inset-x-4 top-4 z-50 flex flex-col gap-2 md:left-auto md:right-6 md:top-6 md:w-96">
      {errors.map((message, i) => (
        <FloatingError key={`${nudge}-${message}`} message={message} delay={i * 60} />
      ))}
    </div>,
    document.body,
  )
}

function FloatingError({ message, delay }: { message: string; delay: number }) {
  const [closed, setClosed] = useState(false)
  if (closed) return null
  return (
    <div
      role="alert"
      style={{ animationDelay: `${delay}ms` }}
      className="apply-error-in relative rounded-xl bg-status-danger-bg py-2.5 pl-3 pr-9 text-sm text-status-danger-text shadow-lg shadow-black/10 ring-1 ring-status-danger-text/20"
    >
      {message}
      <button
        type="button"
        onClick={() => setClosed(true)}
        aria-label="Close"
        className="absolute right-1.5 top-1.5 rounded-lg p-1 text-status-danger-text hover:bg-black/5"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

function PersonalStep({
  form,
  set,
  errors,
  nudge,
  onNext,
}: {
  form: FormState
  set: SetField
  errors: string[]
  /** Bumped on each Next that fails, to replay the sign-up note's shake. */
  nudge: number
  onNext: (e: FormEvent) => void
}) {
  const ref = useReveal<HTMLDivElement>(REVEAL)
  const failed = errors.length > 0
  const highlightSignup = failed && onlyRemotasksMissing(form)
  // Red until it's fixed, after a Next that found it filled in but not a real ID.
  const remotasksIdInvalid = failed && form.remotasks_id.trim() !== '' && !normalizeRemotasksId(form.remotasks_id)
  const remotasksIdRef = useRef<HTMLDivElement>(null)
  // Each hint only shows after a failed Next, while its field is still blank or not valid.
  const showFacebookHint = failed && !normalizeProfileUrl(form.facebook_url)
  const showRemotasksIdHint = failed && !normalizeRemotasksId(form.remotasks_id)

  // Shake the ID field on each failed Next while it's invalid, like the sign-up note. Restarting the
  // animation, rather than remounting by key, keeps the cursor in the field.
  useEffect(() => {
    const el = remotasksIdRef.current
    if (!el || !remotasksIdInvalid) return
    el.classList.remove('login-shake')
    void el.offsetWidth
    el.classList.add('login-shake')
    // Only a new Next press replays it, not each keystroke.
  }, [nudge])

  return (
    <div ref={ref}>
      <CardHeading title="Join the flock!" subtitle="Robotics Project Application" />
      <StepIndicator step={1} />
      <form onSubmit={onNext} noValidate className="grid gap-4 md:grid-cols-2 md:items-start">
        <PlayfulInput id="full_name" label="Full Name" icon={User} maxLength={200} value={form.full_name} onChange={set('full_name')} />
        <PlayfulInput id="active_email" label="Active Email" icon={MailCheck} type="email" maxLength={254} value={form.active_email} onChange={set('active_email')} />
        <PlayfulInput
          id="facebook_url"
          label="Facebook Profile Link"
          icon={LinkIcon}
          hint={showFacebookHint ? 'Used to add you to the group chat. Your profile must be set to public and have a profile picture. Please do not put N/A.' : undefined}
          highlightHint
          placeholder="https://facebook.com/your.profile"
          maxLength={500}
          value={form.facebook_url}
          onChange={set('facebook_url')}
        />
        <YesNoPills legend="Do you have a background working on Robotics?" name="robotics" value={form.robotics} onChange={set('robotics')} />
        {/* Highlighted after a Next that only failed for lack of Remotasks details; back to normal once they're filled. */}
        <p
          key={highlightSignup ? nudge : 'idle'}
          className={`${FULL_ROW} rounded-xl px-3 py-2 text-center text-sm ${
            highlightSignup
              ? 'login-shake bg-status-warning-bg font-medium text-status-warning-text ring-2 ring-status-warning-text'
              : 'bg-accent-bg/60 text-accent-foreground'
          }`}
        >
          No Remotasks account yet?{' '}
          <a href={REMOTASKS_SIGNUP_URL} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
            Create one on Remotasks
          </a>{' '}
          first, then come back to fill in your Remotasks details below.
        </p>
        <PlayfulInput id="remotasks_email" label="Remotasks Email" icon={Mail} type="email" maxLength={254} value={form.remotasks_email} onChange={set('remotasks_email')} />
        <div ref={remotasksIdRef}>
          <PlayfulInput
            id="remotasks_id"
            label="Remotasks ID"
            icon={IdCard}
            hint={showRemotasksIdHint ? 'Your 24-character Remotasks ID (numbers 0-9 and letters a-f). Please do not put N/A.' : undefined}
            highlightHint
            placeholder="e.g. 5f3c9a1b2d4e6f7a8b9c0d1e"
            maxLength={200}
            invalid={remotasksIdInvalid}
            value={form.remotasks_id}
            onChange={set('remotasks_id')}
          />
        </div>
        <FormErrors errors={errors} nudge={nudge} />
        <div className={`flex flex-col ${FULL_ROW}`}>
          <SubmitButton pending={false} label="Next" pendingLabel="Next" />
        </div>
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
    <div ref={ref} className={`grid gap-4 md:grid-cols-2 md:items-start ${FULL_ROW}`}>
      <PlayfulInput
        id="cpu"
        label="Processor (CPU)"
        icon={Cpu}
        optional
        placeholder="e.g. Ryzen 5 3600 or Intel Core i5-10400"
        maxLength={200}
        value={form.cpu}
        onChange={set('cpu')}
      />
      <PlayfulInput
        id="gpu"
        label="Graphics card (GPU)"
        icon={CircuitBoard}
        optional
        placeholder="e.g. NVIDIA GTX 1650"
        maxLength={200}
        value={form.gpu}
        onChange={set('gpu')}
      />
      <PlayfulInput
        id="gpu_memory_gb"
        label="GPU memory (GB)"
        icon={MemoryStick}
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
  errors,
  nudge,
  pending,
  onBack,
  onSubmit,
}: {
  form: FormState
  set: SetField
  errors: string[]
  nudge: number
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
      <CardHeading title="Almost there!" subtitle="Robotics Project Application" />
      <StepIndicator step={2} />
      <div className="mb-5 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-400">Requirements</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Must have a personal computer and a stable internet connection</li>
          <li>Minimum specs: Ryzen 3 / Intel i5 with at least 4GB GPU</li>
        </ul>
      </div>
      <form onSubmit={onSubmit} noValidate className="grid gap-4 md:grid-cols-2 md:items-start">
        <YesNoPills legend="Do you have a personal computer?" name="personal_computer" value={form.personal_computer} onChange={set('personal_computer')} />
        <YesNoPills legend="Do you have a stable internet connection?" name="stable_internet" value={form.stable_internet} onChange={set('stable_internet')} />
        {hasComputer && <ComputerDetails form={form} set={set} />}
        {issues.length > 0 && (
          <div role="status" className={`${FULL_ROW} rounded-xl bg-status-warning-bg px-3 py-2 text-sm text-status-warning-text`}>
            Your answers are below the requirements ({describeIssues(issues)}). You can still submit, but we may not be
            able to accept your application.
          </div>
        )}
        <FormErrors errors={errors} nudge={nudge} />
        <div className={`mt-1 flex gap-3 ${FULL_ROW}`}>
          <button
            type="button"
            onClick={onBack}
            className="mt-1 rounded-xl border-2 border-gray-200 px-5 text-sm font-semibold text-gray-600 hover:bg-gray-50"
          >
            Back
          </button>
          <div className="flex flex-1 flex-col">
            <SubmitButton pending={pending} label="Submit application" pendingLabel="Submitting..." />
          </div>
        </div>
      </form>
    </div>
  )
}

// "shean louise margallo" → "Shean Louise Margallo". Only first letters are raised, so names
// already typed with their own capitals (McDonald, JR) keep them.
const capitalizeWords = (text: string) => text.replace(/(^|[\s-])(\p{Ll})/gu, (_, start: string, letter: string) => start + letter.toUpperCase())

function Submitted({ name }: { name: string }) {
  const ref = useReveal<HTMLDivElement>(REVEAL)
  return (
    <div ref={ref} role="status" className="mx-auto max-w-sm">
      <CardHeading
        title="Hoo-ray, you're in!"
        subtitle={`Thanks, ${capitalizeWords(name)}. We'll review your application and get in touch through the active email you gave.`}
      />
    </div>
  )
}

function ApplicationForm({ leadId }: { leadId: string }) {
  const [step, setStep] = useState<1 | 2>(1)
  const [form, setForm] = useState(emptyForm)
  const [errors, setErrors] = useState<string[]>([])
  const [nudge, setNudge] = useState(0)

  const submitMutation = useMutation({
    mutationFn: (input: ApplicationInput) => submitApplication(leadId, input),
    onError: (mutationError: Error) => fail([mutationError.message || 'Could not submit your application.']),
  })

  // Each step is taller than the viewport on a phone; start it from the top.
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [step])

  // Shows the alerts, and counts the attempt so they and the highlights replay.
  function fail(messages: string[]) {
    setErrors(messages)
    setNudge((n) => n + 1)
  }

  const set: SetField = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }))

  function handleNext(e: FormEvent) {
    e.preventDefault()
    const stepErrors = personalStepErrors(form)
    if (stepErrors.length > 0) {
      fail(stepErrors)
      return
    }
    setErrors([])
    setStep(2)
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const personalErrors = personalStepErrors(form)
    if (personalErrors.length > 0) {
      fail(personalErrors)
      setStep(1)
      return
    }
    const computerErrors = computerStepErrors(form)
    if (computerErrors.length > 0) {
      fail(computerErrors)
      return
    }
    const facebookUrl = normalizeProfileUrl(form.facebook_url)!
    // CPU, GPU and GPU memory are optional, and only asked of someone with a computer:
    // a blank answer, or anything typed before switching to No, is sent as null.
    const hasComputer = form.personal_computer === 'yes'
    const gpuMemory = hasComputer && form.gpu_memory_gb.trim() !== '' ? Number(form.gpu_memory_gb) : null
    setErrors([])
    submitMutation.mutate({
      remotasks_email: form.remotasks_email.trim(),
      remotasks_id: normalizeRemotasksId(form.remotasks_id)!,
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

  if (step === 1) {
    return (
      <PersonalStep
        form={form}
        set={set}
        errors={errors}
        nudge={nudge}
        onNext={handleNext}
      />
    )
  }

  return (
    <ComputerStep
      form={form}
      set={set}
      errors={errors}
      nudge={nudge}
      pending={submitMutation.isPending}
      onBack={() => {
        setErrors([])
        setStep(1)
      }}
      onSubmit={handleSubmit}
    />
  )
}

// A centred title and message, for the screens shown instead of the form.
function Notice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="text-center">
      <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
      <p className="mt-2 text-sm text-gray-500">{children}</p>
    </div>
  )
}

// Public page a lead shares with applicants: no sign-in, so it talks to the
// database only through the hiring RPCs (see supabase/schema.sql).
export function Apply() {
  const { leadId = '' } = useParams()
  // The owl watches whichever field is being filled in, following the text as it grows (like the
  // login page). Handled here, around the whole card, so the form steps don't need to know.
  // The update waits a frame: re-rendering this page while a keystroke is still being handled made
  // React put the input's old value back before its onChange ran, so the typing was lost.
  const [look, setLook] = useState({ x: 0, y: 0 })
  const watchRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const area = watchRef.current
    if (!area) return
    let frame = 0
    const later = (next: { x: number; y: number }) => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setLook(next))
    }
    function watch(e: Event) {
      const field = e.target
      if (!(field instanceof HTMLInputElement)) return
      const length = field.type === 'radio' || field.type === 'checkbox' ? 14 : field.value.length
      later({ x: Math.min(length / 28, 1) * 2 - 1, y: 1 })
    }
    const rest = () => later({ x: 0, y: 0 })
    area.addEventListener('focusin', watch)
    area.addEventListener('input', watch)
    area.addEventListener('focusout', rest)
    return () => {
      cancelAnimationFrame(frame)
      area.removeEventListener('focusin', watch)
      area.removeEventListener('input', watch)
      area.removeEventListener('focusout', rest)
    }
  }, [])

  const { data: lead, isLoading, error: leadError } = useQuery({
    queryKey: ['application-lead', leadId],
    queryFn: () => fetchApplicationLead(leadId),
    retry: false,
  })
  usePageTitle(lead ? `Apply to ${lead.name}'s team` : 'Apply')

  // If the country can't be told (null), the form stays open rather than turning away
  // someone who may well be eligible; only a known non-Philippines address is blocked.
  const { data: country, isLoading: countryLoading } = useQuery({
    queryKey: ['visitor-country'],
    queryFn: fetchVisitorCountry,
    retry: false,
    staleTime: Infinity,
  })
  const eligible = !country || country === ELIGIBLE_COUNTRY

  let content
  if (isLoading || countryLoading) {
    content = <p className="text-center text-sm text-gray-400">Loading...</p>
  } else if (leadError) {
    content = (
      <ErrorNote message="Could not load this application form. Please try again later." />
    )
  } else if (!lead) {
    content = (
      <Notice title="Link not valid">This application link isn't active. Ask the person who sent it for a new one.</Notice>
    )
  } else if (!lead.accepting) {
    content = (
      <Notice title="Applications are closed">
        We're not accepting applications right now. Please check back later.
      </Notice>
    )
  } else if (!eligible) {
    content = (
      <Notice title="Not eligible">
        Sorry, this project is only open to applicants based in the Philippines, so we can't accept an application from
        your location.
        <span className="mt-2 block">If you are in the Philippines and using a VPN, turn it off and reload this page.</span>
      </Notice>
    )
  } else {
    content = <ApplicationForm leadId={leadId} />
  }
  // The form gets a wider card for its two columns; the one-line notices stay narrow.
  const showingForm = !!lead?.accepting && eligible

  return (
    <PerchedCard lookX={look.x} lookY={look.y} maxWidthClassName={showingForm ? 'max-w-md md:max-w-3xl' : 'max-w-md'}>
      <div ref={watchRef}>
        {content}
      </div>
    </PerchedCard>
  )
}
